import json, re, subprocess, sys, time
from urllib.parse import quote

def ls(path=""):
    url = f"https://github.com/sgossner/VCSL/tree/master/{quote(path)}"
    h = subprocess.run(["curl","-sL","-m","40","-A","Mozilla/5.0",url],
                       capture_output=True).stdout.decode("utf-8","replace")
    m = re.search(r'data-target="react-app.embeddedData">(.*?)</script>', h, re.S)
    if not m:
        return []
    d = json.loads(m.group(1))
    try:
        return d["payload"]["codeViewTreeRoute"]["tree"]["items"]
    except KeyError:
        return []

if __name__ == "__main__":
    for it in ls(sys.argv[1] if len(sys.argv) > 1 else ""):
        print(it["contentType"][:4], it["path"])
