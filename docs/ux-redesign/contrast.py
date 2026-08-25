"""Calculadora WCAG 2.x — razao de contraste (L1+0.05)/(L2+0.05).
Fonte normativa: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
NAO arredonda para cima: 4.499 nao passa em 4.5 (Understanding 1.4.3)."""
def srgb(c):
    c = c/255.0
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055) ** 2.4
def lum(hexs):
    h = hexs.lstrip('#')
    r,g,b = (int(h[i:i+2],16) for i in (0,2,4))
    return 0.2126*srgb(r) + 0.7152*srgb(g) + 0.0722*srgb(b)
def ratio(a,b):
    la,lb = lum(a),lum(b)
    hi,lo = max(la,lb),min(la,lb)
    return (hi+0.05)/(lo+0.05)
def red_flash(hexs):
    """WCAG 2.2 Note 3: red flash se R/(R+G+B) >= 0.8."""
    h=hexs.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4))
    s=r+g+b
    return (r/s if s else 0)
def check(label, fg, bg, floor):
    r = ratio(fg,bg)
    ok = 'PASS' if r >= floor else 'FAIL'
    print(f'{ok:4} {r:6.2f}:1  (piso {floor})  {label}  {fg} sobre {bg}')
    return r >= floor
