"""Transfer and run an already approved candidate; credentials remain local."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("remote_ssh", ROOT / "release-tools/remote-ssh.py")
ssh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ssh)


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def read(file):
    return json.loads(Path(file).read_text(encoding="utf-8-sig"))


def write(file, value):
    temporary = file.with_suffix(".new")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(file)


def observe_post_task(operation, observation, now_ms=None):
    if not observation.get("ok") or not observation.get("pid") or not observation.get("created"):
        raise ssh.DeployError("REMOTE_POST_TASK_HEALTH_FAILED")
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000) if now_ms is None else now_ms
    old = operation.get("postTask")
    if old and (old["pid"] != observation["pid"] or old["created"] != observation["created"]):
        raise ssh.DeployError("REMOTE_SERVICE_RESTARTED_DURING_VERIFICATION")
    operation["postTask"] = {**(old or {"firstMs": now_ms}), **observation, "lastMs": now_ms}
    return now_ms - operation["postTask"]["firstMs"] >= 60000


def notify(local, ticket, phase, ended_at=None):
    if ticket.get("notificationPolicy") == "none-by-user":
        return {"status": "suppressed", "reason": "user-request"}
    info = {"release": ticket["release"], "phase": phase,
            "startedAt": ticket["startedAt"], "baseline": ticket["baselineRelease"],
            "changes": ticket["changes"], "eventId": "attempt-" + str(ticket.get("attempt", 1))}
    if ended_at:
        info["endedAt"] = ended_at
    if phase == "success":
        info["remoteVerified"] = True
    if phase == "error":
        info["note"] = "更新未完成，请以部署验收记录中的恢复状态为准。"
    file = local / ("notification-" + phase + ".json")
    write(file, info)
    command = ["node", str(ROOT / "release-tools/notify-release.cjs"), str(file)]
    if ticket.get("notificationPreview"):
        command.append("--preview")
    result = subprocess.run(command,
                            cwd=ROOT, capture_output=True, text=True, timeout=70,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise ssh.DeployError("RELEASE_NOTIFICATION_FAILED_CHECK_LEDGER")
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "retry", "start", "status"])
    parser.add_argument("--release", required=True)
    parser.add_argument("--runtime", default="E:/AI/Codex-tools/ssh-deploy-runtime")
    parser.add_argument("--credential-dir", default="E:/AI/Codex-tools/secrets/overseas-project-deploy")
    parser.add_argument("--notice-file")
    parser.add_argument("--notification-preview", action="store_true")
    parser.add_argument("--no-notifications", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{8}\.\d+", args.release):
        raise ssh.DeployError("RELEASE_ID_INVALID")
    sys.path.insert(0, args.runtime)
    import paramiko
    credentials = Path(args.credential_dir)
    config = ssh.validate_config(read(credentials / "target.json"))
    local = ROOT / ".runtime" / ("remote-deploy-" + args.release)
    local.mkdir(exist_ok=True)
    ledger_file = local / "operation.json"
    with ssh.authenticated(config, credentials / "credential.dpapi") as client:
        if args.mode == "prepare":
            if (ROOT / "reports" / ("project-release-" + args.release + ".invalid.json")).exists():
                raise ssh.DeployError("CANDIDATE_INVALIDATED")
            if ledger_file.exists():
                raise ssh.DeployError("DEPLOYMENT_LEDGER_EXISTS_CHECK_STATUS_FIRST")
            proof = read(ROOT / "reports" / ("project-release-" + args.release + ".proof.json"))
            if proof["status"] != "LOCAL_INSTALL_ROLLBACK_AND_CANDIDATE_SMOKE_PASSED":
                raise ssh.DeployError("CANDIDATE_NOT_APPROVED")
            bundle = ROOT / ".runtime" / ("project-release-" + args.release) / "bundle"
            manifest_file = bundle / "release-manifest.json"
            if digest(manifest_file) != proof["manifestSha256"]:
                raise ssh.DeployError("FROZEN_MANIFEST_CHANGED")
            manifest = read(manifest_file)
            if (manifest["targetRoot"] != config["root"] or manifest["port"] != 3333
                    or manifest["id"] != args.release):
                raise ssh.DeployError("CANDIDATE_TARGET_MISMATCH")
            for name, expected in manifest["files"].items():
                if digest(bundle / "payload" / name) != expected:
                    raise ssh.DeployError("FROZEN_SOURCE_CHANGED")
            for name, expected in manifest["tools"].items():
                if digest(bundle / name) != expected:
                    raise ssh.DeployError("FROZEN_INSTALLER_CHANGED")
            payload = local / "project-payload.zip"
            if digest(payload) != proof["payloadSha256"]:
                raise ssh.DeployError("PAYLOAD_ARCHIVE_CHANGED")
            before = ssh.powershell(client, (ROOT / "release-tools/Remote-Preflight.ps1").read_text(), timeout=60)
            if not before.get("ok") or before["maintenance"] or before["releaseOwner"]:
                raise ssh.DeployError("SERVER_NOT_READY")
            if len(before["processes"]) != 1 or not before["processes"][0]["entryPathVerified"]:
                raise ssh.DeployError("SERVER_PROCESS_IDENTITY_UNVERIFIED")
            if any(item["pending"] or item["pendingUploads"] for item in before["ledgers"]):
                raise ssh.DeployError("SERVER_HAS_PENDING_WRITES")
            baseline_id = manifest["predecessor"]["id"]
            transaction = before["transaction"]
            if (not re.fullmatch(r"\d{8}\.\d+", baseline_id) or transaction["phase"] not in ["committed", "rolled-back"]
                    or transaction["schema"] != 1 or transaction["root"] != config["root"]):
                raise ssh.DeployError("SERVER_TRANSACTION_REQUIRES_REVIEW")
            baseline = read(ROOT / ".runtime" / ("project-release-" + baseline_id) / "bundle/release-manifest.json")
            expected_core = transaction["beforeCore"] if transaction["phase"] == "rolled-back" else transaction["targetCore"]
            if expected_core != baseline["core"]:
                raise ssh.DeployError("SERVER_BASELINE_UNRECOGNIZED")
            stage = "C:\\ProgramData\\VNET-Overseas-Deploy\\" + args.release + "-" + proof["manifestSha256"][:8]
            task = "VNET-Overseas-Deploy-" + args.release + "-" + proof["manifestSha256"][:8]
            files = {"project-payload.zip": payload,
                     "InstallProject.ps1": ROOT / ".runtime" / ("project-release-" + args.release) / "outer/InstallProject.ps1",
                     "remote-install.cjs": ROOT / "release-tools/remote-install.cjs",
                     "Remote-Run.ps1": ROOT / "release-tools/Remote-Run.ps1",
                     "Remote-Service.ps1": ROOT / "release-tools/Remote-Service.ps1",
                     "Remote-Verify.ps1": ROOT / "release-tools/Remote-Verify.ps1",
                     "Remote-Stop.ps1": ROOT / "release-tools/Remote-Stop.ps1"}
            ticket = {"release": args.release, "root": config["root"], "port": 3333, "node": manifest["node"],
                      "manifestSha256": proof["manifestSha256"], "payloadSha256": proof["payloadSha256"],
                      "baselineRelease": baseline_id, "baselineCore": baseline["core"],
                      "environmentSha256": before["environmentSha256"], "process": before["processes"][0],
                      "uploadHashes": {name: digest(file) for name, file in files.items()}, "postTaskVerification": True}
            ticket_file = local / "ticket.json"
            write(ticket_file, ticket)
            script = """$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$stage=@STAGE@
if(Test-Path -LiteralPath $stage){throw 'REMOTE_STAGE_EXISTS'}
$at=$stage;while($at){if((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'REPARSE_STAGE'};$at=Split-Path -Parent $at}
[void][IO.Directory]::CreateDirectory($stage)
$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
foreach($id in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($id),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
Set-Acl -LiteralPath $stage -AclObject $acl
@{ok=$true}|ConvertTo-Json -Compress
""".replace("@STAGE@", literal(stage))
            ssh.powershell(client, script)
            operation = {"release": args.release, "stage": stage, "task": task, "status": "uploading",
                         "manifestSha256": proof["manifestSha256"], "ticketSha256": digest(ticket_file)}
            write(ledger_file, operation)
            with paramiko.SFTPClient.from_transport(client) as sftp:
                remote = sftp.normalize(stage.replace("\\", "/"))
                for name, file in files.items():
                    sftp.put(str(file), remote + "/" + name, confirm=True)
                sftp.put(str(ticket_file), remote + "/ticket.json", confirm=True)
            check_script = """$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$stage=@STAGE@;$file=Join-Path $stage 'ticket.json'
if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne @TICKET@){throw 'TICKET_HASH'}
$ticket=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json
foreach($entry in $ticket.uploadHashes.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $stage $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'UPLOAD_HASH'}}
@{ok=$true;verified=$true}|ConvertTo-Json -Compress
""".replace("@STAGE@", literal(stage)).replace("@TICKET@", literal(digest(ticket_file)))
            ssh.powershell(client, check_script)
            operation["status"] = "ready"
            write(ledger_file, operation)
            print(json.dumps({"ok": True, "release": args.release, "status": "ready", "baseline": baseline_id}))
        else:
            operation = read(ledger_file)
            stage, task = operation["stage"], operation["task"]
            ticket_file = local / "ticket.json"
            ticket = read(ticket_file)
            if args.mode == "retry":
                if operation["status"] != "error" or not operation.get("result", {}).get("rollbackVerified") or ticket.get("attempt", 1) != 1:
                    raise ssh.DeployError("RETRY_REQUIRES_VERIFIED_FIRST_ROLLBACK")
                before = ssh.powershell(client, (ROOT / "release-tools/Remote-Preflight.ps1").read_text(), timeout=60)
                if (before["maintenance"] or before["releaseOwner"] or before["processes"] != [ticket["process"]]
                        or before["environmentSha256"] != ticket["environmentSha256"]
                        or before["transaction"]["release"] != args.release or before["transaction"]["phase"] != "rolled-back"
                        or any(item["pending"] or item["pendingUploads"] for item in before["ledgers"])):
                    raise ssh.DeployError("RETRY_SERVER_STATE_CHANGED")
                script = """$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$stage=@STAGE@;$ticket=Get-Content -LiteralPath (Join-Path $stage 'ticket.json') -Raw|ConvertFrom-Json
if((Get-FileHash -LiteralPath (Join-Path $stage 'ticket.json') -Algorithm SHA256).Hash.ToLowerInvariant() -cne @TICKET@){throw 'OLD_TICKET_CHANGED'}
foreach($entry in $ticket.uploadHashes.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $stage $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'OLD_UPLOAD_CHANGED'}}
foreach($entry in $ticket.baselineCore.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $ticket.root $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'BASELINE_CHANGED'}}
$archive=Join-Path $stage 'attempt-1';if(Test-Path -LiteralPath $archive){throw 'ATTEMPT_ARCHIVE_EXISTS'}
foreach($item in @(Get-Item -LiteralPath $stage -Force)+@(Get-ChildItem -LiteralPath $stage -Force -Recurse)){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_STAGE'}}
[void][IO.Directory]::CreateDirectory($archive)
foreach($name in @('ticket.json','remote-install.cjs','Remote-Run.ps1','worker.log','archive-check.log')){$file=Join-Path $stage $name;if(Test-Path -LiteralPath $file){Copy-Item -LiteralPath $file -Destination (Join-Path $archive $name)}}
Move-Item -LiteralPath (Join-Path $stage 'result.json') -Destination (Join-Path $archive 'result.json')
@{ok=$true;archived=$true}|ConvertTo-Json -Compress
""".replace("@STAGE@", literal(stage)).replace("@TICKET@", literal(operation["ticketSha256"]))
                ssh.powershell(client, script, timeout=60)
                write(local / "operation-attempt-1.json", operation)
                files = {name: ROOT / "release-tools" / name for name in ["Remote-Run.ps1", "Remote-Stop.ps1", "remote-install.cjs"]}
                ticket["uploadHashes"].update({name: digest(file) for name, file in files.items()})
                ticket["attempt"] = 2
                write(ticket_file, ticket)
                with paramiko.SFTPClient.from_transport(client) as sftp:
                    remote = sftp.normalize(stage.replace("\\", "/"))
                    for name, file in files.items():
                        sftp.put(str(file), remote + "/" + name, confirm=True)
                    sftp.put(str(ticket_file), remote + "/ticket.json", confirm=True)
                operation.update({"status": "ready", "attempt": 2, "task": task + "-attempt2", "ticketSha256": digest(ticket_file)})
                operation.pop("result", None)
                write(ledger_file, operation)
                print(json.dumps({"ok": True, "status": "ready", "attempt": 2}))
                return
            if args.mode == "start":
                if operation["status"] != "ready":
                    raise ssh.DeployError("CHECK_EXISTING_DEPLOYMENT_STATUS")
                script = """$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$stage=@STAGE@;$name=@TASK@
if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'DEPLOY_TASK_EXISTS_CHECK_RESULT'}
$arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $stage 'Remote-Run.ps1')+'" -TicketFile "'+(Join-Path $stage 'ticket.json')+'"'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $stage
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings|Out-Null
Start-ScheduledTask -TaskName $name
@{ok=$true;task=$name;status='started'}|ConvertTo-Json -Compress
""".replace("@STAGE@", literal(stage)).replace("@TASK@", literal(task))
                ticket.setdefault("startedAt", datetime.now(timezone.utc).isoformat())
                if not ticket.get("changes") and not args.no_notifications:
                    if not args.notice_file:
                        raise ssh.DeployError("RELEASE_NOTICE_REQUIRED")
                    notice = read(args.notice_file)
                    if notice["release"] != args.release or not 1 <= len(notice.get("changes", [])) <= 5:
                        raise ssh.DeployError("RELEASE_NOTICE_INVALID")
                    ticket["changes"] = notice["changes"]
                ticket["notificationPreview"] = args.notification_preview
                ticket["notificationPolicy"] = "none-by-user" if args.no_notifications else "standard"
                write(ticket_file, ticket)
                with paramiko.SFTPClient.from_transport(client) as sftp:
                    sftp.put(str(ticket_file), sftp.normalize(stage.replace("\\", "/")) + "/ticket.json", confirm=True)
                operation["startNotice"] = notify(local, ticket, "start")
                operation["status"] = "start_requested"
                operation["ticketSha256"] = digest(ticket_file)
                write(ledger_file, operation)
                result = ssh.powershell(client, script)
                operation["status"] = "running"
                write(ledger_file, operation)
            else:
                script = """$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$stage=@STAGE@;$name=@TASK@;$file=Join-Path $stage 'result.json'
$task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
$result=$null;if(Test-Path -LiteralPath $file){$result=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json}
@{ok=$true;taskState=[string]$task.State;result=$result}|ConvertTo-Json -Depth 10 -Compress
""".replace("@STAGE@", literal(stage)).replace("@TASK@", literal(task))
                result = ssh.powershell(client, script)
                if (result.get("result") or {}).get("status") in ("success", "error"):
                    operation["status"] = result["result"]["status"]
                    operation["result"] = result["result"]
                    write(ledger_file, operation)
                    terminal = result["result"]
                    if terminal["release"] != args.release or terminal["manifestSha256"] != operation["manifestSha256"]:
                        raise ssh.DeployError("REMOTE_RESULT_IDENTITY_MISMATCH")
                    if terminal["status"] == "success" and not all(terminal.get(key) is True for key in ["ok", "remoteServerVerified", "privateDataCheckedBeforeStart", "environmentPreserved", "httpsHealthPassed"]):
                        raise ssh.DeployError("REMOTE_SUCCESS_EVIDENCE_INCOMPLETE")
                    if terminal["status"] == "success" and ticket.get("postTaskVerification") and not operation.get("postTaskVerified"):
                        verify_script = "& " + literal(stage + "\\Remote-Verify.ps1") + " -TicketFile " + literal(stage + "\\ticket.json")
                        observation = ssh.powershell(client, verify_script, timeout=60)
                        try:
                            verified = False if observation.get("waitingForTask") else observe_post_task(operation, observation)
                        except ssh.DeployError:
                            operation["status"] = "error"
                            operation["endNotice"] = notify(local, ticket, "error", datetime.now(timezone.utc).isoformat())
                            write(ledger_file, operation)
                            raise
                        if not verified:
                            operation["status"] = "running"
                            write(ledger_file, operation)
                            print(json.dumps({"ok": True, "release": args.release, "data": {"status": "running", "phase": "post-task-health"}}))
                            return
                        terminal["postTaskVerified"] = True
                        operation["postTaskVerified"] = True
                        terminal["at"] = observation["at"]
                        operation["result"] = terminal
                    operation["endNotice"] = notify(local, ticket, terminal["status"], terminal["at"])
                    write(ledger_file, operation)
            print(json.dumps({"ok": True, "release": args.release, "data": result}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error) if isinstance(error, ssh.DeployError) else "REMOTE_DEPLOYMENT_FAILED_CHECK_LEDGER"}))
        raise SystemExit(1)
