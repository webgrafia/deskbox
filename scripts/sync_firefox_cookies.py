#!/usr/bin/env python3
import sys
import json
import browser_cookie3
import requests

def get_google_cookies():
    try:
        cj = browser_cookie3.firefox()
    except Exception as e:
        sys.stderr.write(f"Firefox cookie read error: {e}\n")
        return []

    # Check if base authentication cookies are present
    auth_cookies = [c.name for c in cj if c.name in ['SID', 'SSID', 'HSID', 'SAPISID']]
    if not auth_cookies:
        sys.stderr.write("No base Google authentication cookies found in Firefox.\n")
        return []

    session = requests.Session()
    session.cookies = cj
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }

    # Warm up specific Google services to generate service-specific tickets (OSID, __Secure-OSID, COMPASS)
    targets = [
        'https://mail.google.com/mail/u/0/',
        'https://calendar.google.com/calendar/u/0/r',
        'https://antigravity.google.com/',
        'https://messages.google.com/web'
    ]

    for url in targets:
        try:
            session.get(url, headers=headers, timeout=5, allow_redirects=True)
        except Exception as e:
            sys.stderr.write(f"Warmup warning for {url}: {e}\n")

    cookies = []
    seen = set()

    for c in session.cookies:
        if 'google' in c.domain or 'youtube' in c.domain:
            key = (c.name, c.domain, c.path)
            if key in seen:
                continue
            seen.add(key)

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
                "httpOnly": bool(getattr(c, 'httpOnly', False) or c.has_nonstandard_attr('HttpOnly') or c.has_nonstandard_attr('httponly'))
            }

            if c.expires and c.expires > 0:
                cookie_obj["expirationDate"] = float(c.expires)

            cookies.append(cookie_obj)

    return cookies

if __name__ == '__main__':
    cookies = get_google_cookies()
    cal_cookies = [c['name'] for c in cookies if 'calendar' in c['domain']]
    mail_cookies = [c['name'] for c in cookies if 'mail' in c['domain']]
    sys.stderr.write(f"Successfully gathered {len(cookies)} Google cookies (Calendar: {len(cal_cookies)}, Mail: {len(mail_cookies)})\n")
    print(json.dumps(cookies))
