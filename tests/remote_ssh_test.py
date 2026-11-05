import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from contextlib import contextmanager
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("remote_ssh", Path(__file__).parents[1] / "release-tools/remote-ssh.py")
ssh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ssh)


class FakeKey:
    def __init__(self, raw=b"test-host-key", name="ssh-ed25519"):
        self.raw, self.name = raw, name

    def get_name(self):
        return self.name

    def asbytes(self):
        return self.raw


class RemoteSSHTests(unittest.TestCase):
    def config(self):
        raw = b"test-host-key"
        return {"schema": 1, "host": "124.222.19.16", "port": 22, "username": "Administrator",
                "applicationPort": 3333, "root": ssh.APP_ROOT,
                "hostKey": {"type": "ssh-ed25519", "base64": base64.b64encode(raw).decode(),
                            "sha256": ssh.fingerprint(raw)}}

    def test_wrong_port_project_or_user_is_rejected(self):
        self.assertEqual(ssh.validate_config(self.config())["applicationPort"], 3333)
        for key, value in [("applicationPort", 3001), ("port", 23), ("username", "another"), ("root", r"C:\ai\other")]:
            bad = self.config()
            bad[key] = value
            with self.assertRaises(ssh.DeployError):
                ssh.validate_config(bad)

    def test_changed_host_identity_is_rejected(self):
        ssh.verify_host_key(self.config()["hostKey"], FakeKey())
        for key in [FakeKey(b"changed-host-key"), FakeKey(name="ssh-rsa")]:
            with self.assertRaisesRegex(ssh.DeployError, "SSH_HOST_KEY_CHANGED"):
                ssh.verify_host_key(self.config()["hostKey"], key)

    def test_tampered_pin_is_rejected(self):
        bad = self.config()
        bad["hostKey"]["sha256"] = "SHA256:wrong"
        with self.assertRaisesRegex(ssh.DeployError, "SSH_PIN_INVALID"):
            ssh.validate_config(bad)

    def test_host_mismatch_is_checked_before_decrypting_or_authenticating(self):
        class FakeTransport:
            def get_remote_server_key(self):
                return FakeKey(b"changed-host")
        @contextmanager
        def connection(*_):
            yield FakeTransport()
        with patch.object(ssh, "transport", connection), patch.object(ssh, "unprotect_password") as decrypt:
            with self.assertRaisesRegex(ssh.DeployError, "SSH_HOST_KEY_CHANGED"):
                with ssh.authenticated(self.config(), "unused"):
                    self.fail("must not authenticate")
            decrypt.assert_not_called()

    def test_windows_powershell_dpapi_interoperability(self):
        with tempfile.TemporaryDirectory(prefix="overseas-dpapi-test-") as directory:
            file = Path(directory) / "fixture.dpapi"
            script = """
Add-Type -AssemblyName System.Security
$plain=[guid]::NewGuid().ToString('N')
$bytes=[Text.Encoding]::UTF8.GetBytes($plain)
$entropy=[Text.Encoding]::UTF8.GetBytes('VNET-Overseas-Deploy-SSH-v1')
$encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($env:DPAPI_TEST_FILE,$encrypted)
$sha=[Security.Cryptography.SHA256]::Create()
([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
"""
            import os
            result = subprocess.run(["powershell.exe", "-NoProfile", "-Command", script], capture_output=True,
                                    text=True, timeout=15, env={**os.environ, "DPAPI_TEST_FILE": str(file)},
                                    creationflags=subprocess.CREATE_NO_WINDOW)
            self.assertEqual(result.returncode, 0)
            secret = ssh.unprotect_password(file)
            self.assertEqual(hashlib.sha256(secret.encode()).hexdigest(), result.stdout.strip())
            file.write_bytes(b"not-a-valid-dpapi-blob")
            with self.assertRaises(ssh.DeployError):
                ssh.unprotect_password(file)

    def test_long_scripts_use_one_framed_stdin_message_and_short_command_line(self):
        class Channel:
            sent = b""
            command = ""
            read = False
            def exec_command(self, command): self.command = command
            def sendall(self, data): self.sent += data
            def shutdown_write(self): pass
            def recv_ready(self): return not self.read
            def recv_stderr_ready(self): return False
            def recv(self, _): self.read = True; return b'{"ok":true}'
            def exit_status_ready(self): return self.read
            def recv_exit_status(self): return 0
            def close(self): pass
        channel = Channel()
        class Client:
            def open_session(self, **_): return channel
        script = "# test\n" * 10000
        self.assertEqual(ssh.powershell(Client(), script), {"ok": True})
        self.assertLess(len(channel.command), 2000)
        self.assertEqual(base64.b64decode(channel.sent), script.encode())


if __name__ == "__main__":
    unittest.main()
