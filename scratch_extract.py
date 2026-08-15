import requests
import re
import json

r = requests.get('https://prts.wiki/w/%E8%B4%A7%E8%BF%90%E4%BB%93%E5%BA%93', timeout=15)
html = r.text

urls = re.findall(r'src=["\']([^"\']+\.(?:png|jpg|webp))["\']', html)
for u in set(urls):
    if not u.startswith('http'):
        u = 'https:' + u if u.startswith('//') else 'https://prts.wiki' + u
    print("URL:", u)

# Also test torappu theme group images
print("\n--- Testing Torappu Theme Assets ---")
theme_ids = ['furni_set_warehouse', 'furni_set_cafe', 'furni_set_s1_01', 'furni_set_pizza']
for tid in theme_ids:
    for pattern in [
        f'https://torappu.prts.wiki/assets/building/theme/{tid}.png',
        f'https://torappu.prts.wiki/assets/building/theme_preview/{tid}.png',
        f'https://torappu.prts.wiki/assets/theme/{tid}.png',
        f'https://torappu.prts.wiki/assets/furniture_theme/{tid}.png'
    ]:
        try:
            res = requests.head(pattern, timeout=4)
            print(pattern, "->", res.status_code)
        except Exception as e:
            pass
