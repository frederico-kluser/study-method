import colorsys, sys
sys.path.insert(0,'.')
from contrast import ratio

def hsl(h,s,l):
    r,g,b = colorsys.hls_to_rgb(h/360.0, l, s)
    return '#%02x%02x%02x' % (round(r*255),round(g*255),round(b*255))

def scan(h,s,pred,desc):
    """desc=True -> varre L de claro p/ escuro e devolve o PRIMEIRO que passa
       (= o mais claro/vivido possivel). desc=False -> do escuro p/ claro."""
    rng = range(995,4,-5) if desc else range(5,996,5)
    for i in rng:
        c = hsl(h,s,i/1000)
        if pred(c): return c
    return None

LIGHT_BASE='#faf7f2'; LIGHT_CARD='#ffffff'; LIGHT_SUNK='#efeae1'
DARK_BASE='#12141a';  DARK_CARD='#1b1e26';  DARK_SUNK='#0d0f14'
DARK_INK='#12141a'

FAM={'action':(8,0.78,0.80),'success':(150,0.62,0.62),'info':(196,0.85,0.80),
     'warn':(38,0.92,0.90),'study':(272,0.62,0.72)}

print('LIGHT — acento como TEXTO (>=4.5 sobre #faf7f2) e como PREENCHIMENTO (texto #fff >=4.5)')
light={}
for n,(h,sl,sd) in FAM.items():
    txt  = scan(h,sl, lambda c: ratio(c,LIGHT_BASE)>=4.5, True)
    fill = scan(h,sl, lambda c: ratio('#ffffff',c)>=4.5, True)
    light[n]=(txt,fill)
    print(f'  {n:8} texto {txt} {ratio(txt,LIGHT_BASE):5.2f}:1   fill {fill} {ratio("#ffffff",fill):5.2f}:1')

print('DARK — acento como TEXTO (>=4.5 sobre #12141a) e como PREENCHIMENTO (texto #12141a >=4.5)')
dark={}
for n,(h,sl,sd) in FAM.items():
    txt  = scan(h,sd, lambda c: ratio(c,DARK_BASE)>=4.5, False)
    fill = scan(h,sd, lambda c: ratio(DARK_INK,c)>=4.5, False)
    dark[n]=(txt,fill)
    print(f'  {n:8} texto {txt} {ratio(txt,DARK_BASE):5.2f}:1   fill {fill} {ratio(DARK_INK,fill):5.2f}:1')

print()
print('TINTA (texto neutro)')
for lbl,ink,bg in [('light primary','#191713',LIGHT_BASE),('light primary/card','#191713',LIGHT_CARD),
                   ('dark primary','#eceef4',DARK_BASE),('dark primary/card','#eceef4',DARK_CARD)]:
    print(f'  {lbl:20} {ink} -> {ratio(ink,bg):6.2f}:1')
# secundario: alvo >=4.5 (AA) e de preferencia >=7 nao e possivel p/ muted; buscamos ~5.5-7
for cand in ['#5c564c','#544e45','#4b463d']:
    print(f'  light secondary {cand} -> base {ratio(cand,LIGHT_BASE):5.2f}:1  card {ratio(cand,LIGHT_CARD):5.2f}:1')
for cand in ['#a7adbd','#9ba1b2','#b3b9c8']:
    print(f'  dark  secondary {cand} -> base {ratio(cand,DARK_BASE):5.2f}:1  card {ratio(cand,DARK_CARD):5.2f}:1')
print()
print('NAO-TEXTO (>=3:1): bordas e anel de foco')
for cand in ['#d9d2c5','#cdc5b6','#c2b9a8']:
    print(f'  light border {cand} -> base {ratio(cand,LIGHT_BASE):5.2f}:1')
for cand in ['#2b303d','#343a49','#3d4454']:
    print(f'  dark  border {cand} -> base {ratio(cand,DARK_BASE):5.2f}:1  card {ratio(cand,DARK_CARD):5.2f}:1')
