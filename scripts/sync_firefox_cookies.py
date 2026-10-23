#!/usr/bin/env python3
import sys
import json
import browser_cookie3

def get_google_cookies():
    try:
        cj = browser_cookie3.firefox()
    except Exception as e:
        sys.stderr.write(f"Firefox cookie read error: {e}\n")
        return []

    cookies = []
    for c in cj:
        if 'google' in c.domain or 'youtube' in c.domain:
            domain = c.domain
            protocol = 'https' if c.secure else 'http'
            clean_domain = domain[1:] if domain.startswith('.') else domain
            cookie_url = f"{protocol}://{clean_domain}{c.path}"

            cookie_obj = {
                "url": cookie_url,
                "name": c.name,
                "value": c.value,
                "domain": domain,
                "path": c.path,
                "secure": bool(c.secure),
                "httpOnly": bool(c.has_nonstandard_attr('HttpOnly') or c.has_nonstandard_attr('httponly'))
            }

            if c.expires and c.expires > 0:
                cookie_obj["expirationDate"] = float(c.expires)

            cookies.append(cookie_obj)

    return cookies

if __name__ == '__main__':
    cookies = get_google_cookies()
    auth_cookies = [c['name'] for c in cookies if c['name'] in ['SID', 'SSID', 'HSID', 'SAPISID']]
    sys.stderr.write(f"Found {len(cookies)} Google cookies in Firefox (Auth cookies: {auth_cookies})\n")
    print(json.dumps(cookies))
