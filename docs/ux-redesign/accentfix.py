"""Recalibra accentText para >=4.5:1 contra o NIVEL 2 (o mais exigente entre as
superficies de leitura 0-1-2). Niveis 3-4 sao chrome: la o texto e TINTA, nunca acento."""
import colorsys, sys
sys.path.insert(0,'.')
from contrast import ratio, red_flash
def hsl(h,s,l):
    r,g,b=colorsys.hls_to_rgb(h/360.0,l,s); return '#%02x%02x%02x'%(round(r*255),round(g*255),round(b*255))
def scan(h,s,bg,floor,brighten):
    rng = range(5,996,2) if brighten else range(995,4,-2)
    # brighten=True (dark): parte do escuro e sobe -> primeiro que passa e o MENOS neon
    # brighten=False (light): parte do claro e desce -> primeiro que passa e o MENOS pesado
    for i in rng:
        c=hsl(h,s,i/1000)
        if ratio(c,bg)>=4.5: return c
FAM={'action':(8,0.78,0.80),'success':(150,0.62,0.62),'info':(196,0.85,0.80),'warn':(38,0.92,0.90),'study':(272,0.62,0.72)}
L2='#f3eee5'; D2='#232733'
L={'level0':'#faf7f2','level1':'#ffffff','level2':'#f3eee5','level3':'#e9e2d6','level4':'#ddd5c6'}
D={'level0':'#12141a','level1':'#1b1e26','level2':'#232733','level3':'#2c313f','level4':'#363c4c'}
print('=== LIGHT accentText recalibrado (alvo: >=4.5 no nivel 2) ===')
print(f'{"fam":8} {"hex":9}', '  '.join(f'{k:>7}' for k in L), '  redflash')
NL={}
for f,(h,sl,sd) in FAM.items():
    c=scan(h,sl,L2,4.5,False); NL[f]=c
    print(f'{f:8} {c:9}', '  '.join(f'{ratio(c,v):7.2f}' for v in L.values()), f'  {red_flash(c):.3f}')
print()
print('=== DARK accentText recalibrado (alvo: >=4.5 no nivel 2) ===')
print(f'{"fam":8} {"hex":9}', '  '.join(f'{k:>7}' for k in D), '  redflash')
ND={}
for f,(h,sl,sd) in FAM.items():
    c=scan(h,sd,D2,4.5,True); ND[f]=c
    print(f'{f:8} {c:9}', '  '.join(f'{ratio(c,v):7.2f}' for v in D.values()), f'  {red_flash(c):.3f}')
print()
print('=== substituicoes em designTokens.ts ===')
old_l={'action':'#d5331a','success':'#1e804f','info':'#0d79a0','warn':'#9d6607','study':'#964dd5'}
old_d={'action':'#e73f25','success':'#218f58','info':'#1489b3','warn':'#ae7209','study':'#a45be4'}
for f in FAM: print(f'  LIGHT {f:8} {old_l[f]} -> {NL[f]}')
for f in FAM: print(f'  DARK  {f:8} {old_d[f]} -> {ND[f]}')
