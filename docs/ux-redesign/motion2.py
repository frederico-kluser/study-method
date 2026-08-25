import math
def settle_crit(k, tol=0.02):
    """Criticamente amortecido (z=1, massa 1): resposta ao degrau
       x(t) = 1 - (1 + w0 t) e^{-w0 t}. Tempo ate |1-x| <= tol."""
    w0=math.sqrt(k); t=0.0; dt=0.0005
    while t < 10:
        if (1+w0*t)*math.exp(-w0*t) <= tol: return t*1000
        t+=dt
    return None
print('EFFECTS (z=1.0, nunca ultrapassa) — tempo de acomodacao a 2% e a 5%')
for n,k in [('fast',3800),('default',1600),('slow',800)]:
    print(f'  {n:8} k={k:5}  2%: {settle_crit(k,0.02):5.0f}ms   5%: {settle_crit(k,0.05):5.0f}ms')
print()
print('=> TOKENS CSS PROPOSTOS (arredondados para a grade de 10ms)')
print('   spatial.fast    105ms  cubic-bezier(0.34, 1.56, 0.64, 1)   [overshoot ~9%]')
print('   spatial.default 150ms  cubic-bezier(0.34, 1.56, 0.64, 1)')
print('   spatial.slow    230ms  cubic-bezier(0.34, 1.56, 0.64, 1)')
print('   effects.fast    100ms  cubic-bezier(0.2, 0, 0, 1)          [monotonico]')
print('   effects.default 160ms  cubic-bezier(0.2, 0, 0, 1)')
print('   effects.slow    240ms  cubic-bezier(0.2, 0, 0, 1)')
