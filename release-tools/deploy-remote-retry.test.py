import base64
import copy
import importlib.util
from pathlib import Path
import re
import subprocess
import sys
import unittest


spec = importlib.util.spec_from_file_location("deploy_remote", Path(__file__).with_name("deploy-remote.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class RetryProcessTest(unittest.TestCase):
    def setUp(self):
        process = {"pid": 100, "created": 200, "name": "node.exe",
                   "executable": "C:\\node.exe", "entryPathVerified": True}
        self.ticket = {"release": "20261117.2", "manifestSha256": "candidate",
                       "root": "C:\\project", "node": process["executable"],
                       "environmentSha256": "env", "baselineCore": {"server.mjs": "old"},
                       "process": process}
        self.operation = {"status": "error", "result": {
            "release": self.ticket["release"], "manifestSha256": "candidate",
            "status": "error", "rollbackVerified": True}}
        restored = {**process, "pid": 101, "created": 300}
        self.before = {"ok": True, "maintenance": False, "releaseOwner": False,
                       "processes": [restored], "environmentSha256": "env",
                       "transaction": {"schema": 1, "release": self.ticket["release"],
                                       "root": self.ticket["root"], "phase": "rolled-back",
                                       "beforeCore": self.ticket["baselineCore"]},
                       "ledgers": [{"pending": 0, "pendingUploads": 0}]}
        self.observation = {"ok": True, "pid": 101, "created": 300}

    def test_verified_rollback_can_bind_the_restored_process(self):
        self.assertEqual(deploy.retry_process(self.ticket, self.operation, self.before, self.observation),
                         self.before["processes"][0])

    def test_unverified_process_or_modified_server_cannot_retry(self):
        for updates in (
            {"maintenance": True}, {"releaseOwner": True}, {"environmentSha256": "changed"},
            {"processes": []}, {"processes": self.before["processes"] * 2},
            {"processes": [{**self.before["processes"][0], "entryPathVerified": False}]},
            {"processes": [{**self.before["processes"][0], "executable": "other.exe"}]},
            {"transaction": {**self.before["transaction"], "beforeCore": {}}},
            {"transaction": {**self.before["transaction"], "phase": "committed"}},
            {"ledgers": [{"pending": 0, "pendingUploads": 1}]},
        ):
            with self.subTest(updates=updates), self.assertRaises(deploy.ssh.DeployError):
                deploy.retry_process(self.ticket, self.operation, {**self.before, **updates}, self.observation)
        for health in ({"ok": False}, {**self.observation, "pid": 100}, {**self.observation, "created": 200}):
            with self.subTest(health=health), self.assertRaises(deploy.ssh.DeployError):
                deploy.retry_process(self.ticket, self.operation, self.before, health)

    def test_wrong_receipt_and_second_retry_are_rejected(self):
        operation = copy.deepcopy(self.operation)
        operation["result"]["manifestSha256"] = "different"
        with self.assertRaises(deploy.ssh.DeployError):
            deploy.retry_process(self.ticket, operation, self.before, self.observation)
        with self.assertRaises(deploy.ssh.DeployError):
            deploy.retry_process({**self.ticket, "attempt": 2}, self.operation, self.before, self.observation)

    @unittest.skipUnless(sys.platform == "win32", "Windows file-sharing flags")
    def test_workbook_probe_detects_sharing_violation_then_recovers(self):
        source = Path(deploy.__file__).read_text(encoding="utf-8")
        helper = re.search(r"Add-Type -TypeDefinition @'\nusing System;.*?\n'@", source, re.S)
        self.assertIsNotNone(helper)
        script = "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'\n" + helper.group() + r"""
$workbook=Join-Path ([IO.Path]::GetTempPath()) ('overseas-retry-'+[guid]::NewGuid()+'.xlsx')
[IO.File]::WriteAllBytes($workbook,[byte[]]@(1))
try {
  $handle=[IO.File]::Open($workbook,'Open','Read','Read')
  try { if([RetryShareCheck]::CanReplace($workbook) -ne 32){throw 'Expected sharing violation'} }
  finally { $handle.Dispose() }
  if([RetryShareCheck]::CanReplace($workbook) -ne 0){throw 'Unlocked workbook rejected'}
} finally { [IO.File]::Delete($workbook) }
Write-Output 'workbook probe passed'
"""
        encoded = base64.b64encode(script.encode("utf-16-le")).decode()
        result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertIn("workbook probe passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
