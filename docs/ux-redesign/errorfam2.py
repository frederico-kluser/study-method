import colorsys, sys
sys.path.insert(0,'.')
from contrast import ratio, red_flash
def hsl(h,s,l):
    r,g,b=colorsys.hls_to_rgb(h/360.0,l,s); return '#%02x%02x%02x'%(round(r*255),round(g*255),round(b*255))
def scan(h,s,bg,floor,up,ink=None):
    for i in (range(5,996,2) if up else range(995,4,-2)):
        c=hsl(h,s,i/1000)
        v = ratio(ink,c) if ink else ratio(c,bg)
        if v>=floor: return c
L={'level0':'#faf7f2','level1':'#ffffff','level2':'#f3eee5','level3':'#e9e2d6','level4':'#ddd5c6'}
D={'level0':'#12141a','level1':'#1b1e26','level2':'#232733','level3':'#2c313f','level4':'#363c4c'}
for H in (338, 332, 326):
    SL,SD=0.70,0.72
    tl=scan(H,SL,L['level2'],4.5,False); td=scan(H,SD,D['level2'],4.5,True)
    fl=scan(H,SL,None,4.5,False,ink='#ffffff'); fd=scan(H,SD,None,4.5,True,ink='#12141a')
    d=min(abs(H-8),360-abs(H-8))
    print(f'--- h={H} (delta {d} graus da action h=8) ---')
    print(f'  LIGHT text {tl}', '  '.join(f'{ratio(tl,v):.2f}' for v in L.values()), f'rf {red_flash(tl):.3f}')
    print(f'  LIGHT fill {fl}  #fff={ratio("#ffffff",fl):.2f}  rf {red_flash(fl):.3f}')
    print(f'  DARK  text {td}', '  '.join(f'{ratio(td,v):.2f}' for v in D.values()), f'rf {red_flash(td):.3f}')
    print(f'  DARK  fill {fd}  #12141a={ratio("#12141a",fd):.2f}  rf {red_flash(fd):.3f}')
