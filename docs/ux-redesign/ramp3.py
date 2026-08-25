import colorsys, sys
sys.path.insert(0,'.')
from contrast import ratio, red_flash
def hsl(h,s,l):
    r,g,b=colorsys.hls_to_rgb(h/360.0,l,s); return '#%02x%02x%02x'%(round(r*255),round(g*255),round(b*255))
def scan(h,s,pred,desc):
    rng=range(995,4,-3) if desc else range(5,996,3)
    for i in rng:
        c=hsl(h,s,i/1000)
        if pred(c): return c
LB='#faf7f2'; LC='#ffffff'; DB='#12141a'; DC='#1b1e26'; INK_D='#12141a'
print('=== 1.4.11 NAO-TEXTO 3:1 — bordas de campo, icones, anel de foco ===')
for n,(h,s) in {'neutro':(38,0.10),'action':(8,0.78),'info':(196,0.85)}.items():
    b_l=scan(h,s,lambda c: ratio(c,LB)>=3.0,True)
    b_d=scan(h,max(s,0.14),lambda c: ratio(c,DB)>=3.0 and ratio(c,DC)>=3.0,False)
    print(f'  {n:7} light {b_l} {ratio(b_l,LB):5.2f}:1(base)  |  dark {b_d} base {ratio(b_d,DB):5.2f}:1 card {ratio(b_d,DC):5.2f}:1')

print()
print('=== BOTAO PRIMARIO PREENCHIDO — duas leituras ===')
for lbl,fill in [('light fill','#de351b')]:
    print(f'  {lbl:12} {fill}  texto #fff {ratio("#ffffff",fill):5.2f}:1   texto #12141a {ratio(INK_D,fill):5.2f}:1')
d_bright='#e73f25'
print(f'  dark  fill   {d_bright}  texto #fff {ratio("#ffffff",d_bright):5.2f}:1   texto #12141a {ratio(INK_D,d_bright):5.2f}:1')
d_white=scan(8,0.78,lambda c: ratio('#ffffff',c)>=4.5,True)
print(f'  dark  alt    {d_white}  (mais escuro, texto #fff {ratio("#ffffff",d_white):5.2f}:1) — vs fundo {ratio(d_white,DB):5.2f}:1')

print()
print('=== TESTE RED FLASH (WCAG 2.2 Nota 3: R/(R+G+B) >= 0.8 e um red flash) ===')
for n,c in [('Nintendo #E60012','#e60012'),('action light','#de351b'),('action dark','#e73f25'),
            ('success dark','#218f58'),('warn light','#9d6607')]:
    v=red_flash(c); print(f'  {n:18} {c}  R/(R+G+B)={v:.3f}  {"RED FLASH" if v>=0.8 else "ok (nao e red flash)"}')

print()
print('=== RAMPA TONAL DE SUPERFICIE (elevacao por cor, sem sombra pesada) ===')
L=['#faf7f2','#ffffff','#f3eee5','#e9e2d6','#ddd5c6']
D=['#12141a','#1b1e26','#232733','#2c313f','#363c4c']
for i,(a,b) in enumerate(zip(L,D)):
    print(f'  nivel {i}: light {a}  (vs base {ratio(a,LB):4.2f}:1)   dark {b}  (vs base {ratio(b,DB):4.2f}:1)')
print()
print('=== TEXTO SOBRE CADA NIVEL (piso 7:1 AAA p/ corpo) ===')
for i,(a,b) in enumerate(zip(L,D)):
    print(f'  nivel {i}: light #191713 {ratio("#191713",a):6.2f}:1 | #544e45 {ratio("#544e45",a):5.2f}:1  ||  dark #eceef4 {ratio("#eceef4",b):6.2f}:1 | #a7adbd {ratio("#a7adbd",b):5.2f}:1')
