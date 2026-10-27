"""Lists compiled methods with an empty body ("Invalid method Code length 0").

    python scripts/scan-empty-methods.py [classes dir]   (default target/classes)

VS Code's Java extension builds into the same target/classes as Maven, and with
some Lombok and Java combinations it writes Lombok constructors with no code
(2026-10-27: all 116 of them). The backend then fails to start. Maven's own
output never has these. Prints the count, then up to 20 of them. 0 is healthy.
"""
import os,struct,sys
def u2(b,o): return struct.unpack('>H',b[o:o+2])[0]
def u4(b,o): return struct.unpack('>I',b[o:o+4])[0]
bad=[]
for root,_,files in os.walk(sys.argv[1] if len(sys.argv) > 1 else 'target/classes'):
    for f in files:
        if not f.endswith('.class'): continue
        p=os.path.join(root,f); b=open(p,'rb').read()
        try:
            cpn=u2(b,8); o=10; cp=[None]*cpn; i=1
            while i<cpn:
                t=b[o]
                if t==1: l=u2(b,o+1); cp[i]=b[o+3:o+3+l].decode('utf8','replace'); o+=3+l
                elif t in (3,4): o+=5
                elif t in (5,6): o+=9; i+=1
                elif t in (7,8,16,19,20): o+=3
                elif t in (9,10,11,12,17,18): o+=5
                elif t==15: o+=4
                else: raise Exception('tag %d'%t)
                i+=1
            o+=6; ic=u2(b,o); o+=2+2*ic
            for k in range(2):
                n=u2(b,o); o+=2
                for _ in range(n):
                    o+=2; name=cp[u2(b,o)]; o+=4; ac=u2(b,o); o+=2
                    for _ in range(ac):
                        an=cp[u2(b,o)]; al=u4(b,o+2)
                        if k==1 and an=='Code' and u4(b,o+10)==0: bad.append(p+' '+name)
                        o+=6+al
        except Exception as e: pass
print(len(bad)); print('\n'.join(bad[:20]))
