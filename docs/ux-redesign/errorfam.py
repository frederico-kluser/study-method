"""Familia `error` PROPRIA, distinta da `action`.
Problema: theme.ts mapeou error<-action, entao error.main == primary.main byte a byte.
Um Alert de erro fica identico a um botao primario. A spec §3.3 so definia um vermelho.
Solucao: carmim (h=350) contra o vermelho-laranja da action (h=8) — matiz distinta o
suficiente para nao confundir, e ainda dentro do registro 'console' da paleta."""
import colorsys, sys
sys.path.insert(0,'.')
from contrast import ratio, red_flash
def hsl(h,s,l):
    r,g,b=colorsys.hls_to_rgb(h/360.0,l,s); return '#%02x%02x%02x'%(round(r*255),round(g*255),round(b*255))
def scan(h,s,bg,floor,up):
    for i in (range(5,996,2) if up else range(995,4,-2)):
        c=hsl(h,s,i/1000)
        if ratio(c,bg)>=floor: return c
L={'level0':'#faf7f2','level1':'#ffffff','level2':'#f3eee5','level3':'#e9e2d6','level4':'#ddd5c6'}
D={'level0':'#12141a','level1':'#1b1e26','level2':'#232733','level3':'#2c313f','level4':'#363c4c'}
H,SL,SD = 350, 0.72, 0.74
print('=== familia error (carmim h=350) ===')
tl = scan(H,SL,L['level2'],4.5,False)
td = scan(H,SD,D['level2'],4.5,True)
fl = scan(H,SL,'#ffffff',4.5,False)   # fill claro: texto branco >=4.5
fd = None
for i in range(5,996,2):
    c=hsl(H,SD,i/1000)
    if ratio('#12141a',c)>=4.5: fd=c; break
print(f'LIGHT text {tl}  niveis:', '  '.join(f'{ratio(tl,v):.2f}' for v in L.values()), f' redflash {red_flash(tl):.3f}')
print(f'LIGHT fill {fl}  texto #fff = {ratio("#ffffff",fl):.2f}', f' redflash {red_flash(fl):.3f}')
print(f'DARK  text {td}  niveis:', '  '.join(f'{ratio(td,v):.2f}' for v in D.values()), f' redflash {red_flash(td):.3f}')
print(f'DARK  fill {fd}  texto #12141a = {ratio("#12141a",fd):.2f}', f' redflash {red_flash(fd):.3f}')
print()
print('=== distincao vs action (recalibrada) ===')
for lbl,a,b in [('LIGHT action vs error text','#cc3119',tl),('DARK action vs error text','#eb614c',td),
                ('LIGHT action vs error fill','#de351b',fl),('DARK action vs error fill','#e73f25',fd)]:
    ha=a.lstrip('#'); hb=b.lstrip('#')
    ra=[int(ha[i:i+2],16) for i in (0,2,4)]; rb=[int(hb[i:i+2],16) for i in (0,2,4)]
    import colorsys as cs
    ha_=cs.rgb_to_hls(*[x/255 for x in ra]); hb_=cs.rgb_to_hls(*[x/255 for x in rb])
    print(f'  {lbl:28} {a} (h={ha_[0]*360:.0f}) vs {b} (h={hb_[0]*360:.0f})  delta-hue={abs(ha_[0]-hb_[0])*360:.0f} graus')
