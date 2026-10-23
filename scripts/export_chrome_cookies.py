#!/usr/bin/env python3
import sys
import os
import json
import sqlite3
import shutil
import tempfile
import hashlib

def get_secret_key():
    pwd = None
    try:
        import secretstorage
        bus = secretstorage.dbus_init()
        col = secretstorage.get_default_collection(bus)
        for item in col.get_all_items():
            if item.get_label() == 'Chrome Safe Storage':
                pwd = item.get_secret()
                break
    except Exception as e:
        sys.stderr.write(f"SecretStorage error: {e}\n")

    if not pwd:
        pwd = b'peanuts'

    # Chrome on Linux derives AES-128 key using 1 iteration of PBKDF2-SHA1
    key = hashlib.pbkdf2_hmac('sha1', pwd, b'saltysalt', 1, 16)
    return key

def decrypt_val(key, enc_val):
    if not enc_val:
        return ""
    if enc_val.startswith(b'v10') or enc_val.startswith(b'v11'):
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            from cryptography.hazmat.primitives import padding
            iv = b' ' * 16
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            dec = decryptor.update(enc_val[3:]) + decryptor.finalize()
            unpadder = padding.PKCS7(128).unpadder()
            val = unpadder.update(dec) + unpadder.finalize()
            return val.decode('utf-8', errors='replace')
        except Exception:
            return ""
    try:
        return enc_val.decode('utf-8', errors='replace')
    except Exception:
        return ""

def export_cookies(profile_name="Profile 1"):
    key = get_secret_key()
    chrome_dir = os.path.expanduser('~/.config/google-chrome')
    cookie_db = os.path.join(chrome_dir, profile_name, 'Cookies')

    if not os.path.exists(cookie_db):
        # Try Default if Profile 1 does not exist
        cookie_db = os.path.join(chrome_dir, 'Default', 'Cookies')

    if not os.path.exists(cookie_db):
        sys.stderr.write(f"Cookies database not found at {cookie_db}\n")
        return []

    # Copy to temp file to avoid locks if Chrome is open
    temp_dir = tempfile.mkdtemp()
    temp_db = os.path.join(temp_dir, 'Cookies.tmp')
    shutil.copy2(cookie_db, temp_db)

    cookies = []
    try:
        conn = sqlite3.connect(temp_db)
        cur = conn.cursor()
        cur.execute("""
            SELECT host_key, name, path, encrypted_value, is_secure, is_httponly, expires_utc, samesite
            FROM cookies
            WHERE host_key LIKE '%google.com'
               OR host_key LIKE '%googleusercontent.com'
               OR host_key LIKE '%gstatic.com'
               OR host_key LIKE '%youtube.com'
        """)
        rows = cur.fetchall()
        for host, name, path, enc_val, sec, http_only, exp, samesite in rows:
            val = decrypt_val(key, enc_val)
            if not val:
                continue

            domain = host
            protocol = 'https' if sec else 'http'
            clean_domain = domain[1:] if domain.startswith('.') else domain
            cookie_url = f"{protocol}://{clean_domain}{path}"

            cookie_obj = {
                "url": cookie_url,
                "name": name,
                "value": val,
                "domain": domain,
                "path": path,
                "secure": bool(sec),
                "httpOnly": bool(http_only)
            }

            # Convert Chromium timestamp (microseconds since Jan 1 1601) to Unix timestamp (seconds)
            if exp and exp > 0:
                unix_ts = (exp - 11644473600000000) / 1000000.0
                if unix_ts > 0:
                    cookie_obj["expirationDate"] = unix_ts

            cookies.append(cookie_obj)
        conn.close()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return cookies

if __name__ == '__main__':
    profile = sys.argv[1] if len(sys.argv) > 1 else "Profile 1"
    cookies = export_cookies(profile)
    print(json.dumps(cookies))
