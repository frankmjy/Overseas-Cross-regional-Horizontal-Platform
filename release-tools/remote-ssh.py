"""Pinned SSH connection for this project's Windows deployment; no secret logging."""
import argparse
import base64
import contextlib
import ctypes
from ctypes import wintypes
import hashlib
import hmac
import ipaddress
import json
import ntpath
from pathlib import Path
import socket
import sys
import time

APP_ROOT = r"C:\ai\overseas-project-management-deploy-20260605-163554"
ENTROPY = b"VNET-Overseas-Deploy-SSH-v1"


class DeployError(Exception):
    pass


def fingerprint(key_bytes):
    return "SHA256:" + base64.b64encode(hashlib.sha256(key_bytes).digest()).decode().rstrip("=")


def validate_config(config):
    if config.get("schema") != 1:
        raise DeployError("SSH_CONFIG_INVALID")
    ipaddress.ip_address(config["host"])
    if (config.get("port") != 22 or config.get("username") != "Administrator"
            or config.get("applicationPort") != 3333
            or ntpath.normcase(ntpath.normpath(config.get("root", ""))) != ntpath.normcase(APP_ROOT)):
        raise DeployError("SSH_TARGET_MISMATCH")
    key = config["hostKey"]
    raw = base64.b64decode(key["base64"], validate=True)
    if not hmac.compare_digest(fingerprint(raw), key["sha256"]):
        raise DeployError("SSH_PIN_INVALID")
    return config


def verify_host_key(expected, actual):
    if (not hmac.compare_digest(expected["type"], actual.get_name())
            or not hmac.compare_digest(base64.b64decode(expected["base64"], validate=True), actual.asbytes())):
        raise DeployError("SSH_HOST_KEY_CHANGED")


def unprotect_password(file):
    if sys.platform != "win32":
        raise DeployError("WINDOWS_DPAPI_REQUIRED")

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    encrypted = Path(file).read_bytes()
    if not 16 <= len(encrypted) <= 16384:
        raise DeployError("SSH_CREDENTIAL_INVALID")
    source_buffer = ctypes.create_string_buffer(encrypted)
    entropy_buffer = ctypes.create_string_buffer(ENTROPY)
    source = Blob(len(encrypted), ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    entropy = Blob(len(ENTROPY), ctypes.cast(entropy_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    crypt = ctypes.windll.crypt32.CryptUnprotectData
    crypt.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.POINTER(Blob), ctypes.c_void_p,
                      ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.restype = wintypes.BOOL
    if not crypt(ctypes.byref(source), None, ctypes.byref(entropy), None, None, 1, ctypes.byref(output)):
        raise DeployError("SSH_CREDENTIAL_NOT_AVAILABLE_TO_THIS_WINDOWS_USER")
    try:
        return ctypes.string_at(output.data, output.size).decode("utf-8")
    finally:
        ctypes.memset(output.data, 0, output.size)
        free = ctypes.windll.kernel32.LocalFree
        free.argtypes = [ctypes.c_void_p]
        free.restype = ctypes.c_void_p
        free(output.data)


@contextlib.contextmanager
def transport(host, port):
    import paramiko
    sock = socket.create_connection((host, port), timeout=12)
    client = paramiko.Transport(sock)
    client.auth_timeout = 15
    try:
        client.start_client(timeout=12)
        yield client
    finally:
        client.close()
        sock.close()


@contextlib.contextmanager
def authenticated(config, secret_file):
    validate_config(config)
    with transport(config["host"], config["port"]) as client:
        verify_host_key(config["hostKey"], client.get_remote_server_key())
        password = unprotect_password(secret_file)
        try:
            client.auth_password(config["username"], password, fallback=False)
        finally:
            password = None
        if not client.is_authenticated():
            raise DeployError("SSH_AUTHENTICATION_FAILED")
        yield client


def powershell(client, script, timeout=40):
    loader = "$line=[Console]::In.ReadLine();$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line));& ([ScriptBlock]::Create($source))"
    encoded = base64.b64encode(loader.encode("utf-16-le")).decode()
    channel = client.open_session(timeout=12)
    try:
        channel.exec_command("powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand " + encoded)
        channel.sendall(base64.b64encode(script.encode("utf-8")) + b"\n")
        channel.shutdown_write()
        output, error = bytearray(), bytearray()
        deadline = time.monotonic() + timeout
        while True:
            if channel.recv_ready():
                output.extend(channel.recv(65536))
            if channel.recv_stderr_ready():
                error.extend(channel.recv_stderr(65536))
            if len(output) + len(error) > 8 * 1024 * 1024:
                raise DeployError("SSH_OUTPUT_LIMIT")
            if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                break
            if time.monotonic() > deadline:
                raise DeployError("SSH_REMOTE_COMMAND_TIMEOUT")
            time.sleep(.03)
        status = channel.recv_exit_status()
        try:
            result = json.loads(output.decode("utf-8-sig").strip())
        except (ValueError, UnicodeError):
            import re
            diagnostic = re.search(r"(RELEASE_WINDOWS_[A-Z_]+_FAILED); type=([A-Za-z]+); line=(\d+)", error.decode("utf-8", errors="ignore"))
            if diagnostic:
                raise DeployError(diagnostic.group(1) + "_" + diagnostic.group(2) + "_LINE_" + diagnostic.group(3)) from None
            raise DeployError("SSH_REMOTE_COMMAND_INVALID_RESPONSE") from None
        if status != 0:
            code = result.get("error", "SSH_REMOTE_COMMAND_FAILED")
            if not isinstance(code, str) or not code.replace("_", "").isalnum():
                code = "SSH_REMOTE_COMMAND_FAILED"
            raise DeployError(code + "_LINE_" + str(int(result.get("line", 0))))
        return result
    finally:
        channel.close()


def probe(client):
    return powershell(client, """
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$admin=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
@{ok=$true;computer=$env:COMPUTERNAME;administrator=$admin}|ConvertTo-Json -Compress
""")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["scan", "check", "audit"])
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--host")
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--config")
    parser.add_argument("--secret")
    parser.add_argument("--output")
    args = parser.parse_args()
    sys.path.insert(0, str(Path(args.runtime).resolve()))
    try:
        if args.mode == "scan":
            ipaddress.ip_address(args.host)
            with transport(args.host, args.port) as client:
                key = client.get_remote_server_key()
                result = {"type": key.get_name(), "base64": key.get_base64(), "sha256": fingerprint(key.asbytes())}
        else:
            config = validate_config(json.loads(Path(args.config).read_text(encoding="utf-8-sig")))
            with authenticated(config, args.secret) as client:
                if args.mode == "audit":
                    script = Path(__file__).with_name("Remote-Preflight.ps1").read_text(encoding="utf-8-sig")
                    result = powershell(client, script, timeout=60)
                    if args.output:
                        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
                else:
                    result = probe(client)
        print(json.dumps({"ok": True, "data": result}, ensure_ascii=False))
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, DeployError) else {
            "AuthenticationException": "SSH_AUTHENTICATION_FAILED",
            "TimeoutError": "SSH_CONNECTION_TIMEOUT",
            "ConnectionRefusedError": "SSH_CONNECTION_REFUSED",
        }.get(type(error).__name__, "SSH_CONNECTION_OR_CONFIGURATION_FAILED")
        print(json.dumps({"ok": False, "error": code}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
