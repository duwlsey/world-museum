from pathlib import Path
import subprocess, hashlib, json
from PIL import Image
root=Path.cwd()
manifest={}
(root/'tmp').mkdir(exist_ok=True)
for name in ['ebook1','ebook2','ebook3']:
    pdf=root/'public'/'ebooks'/f'{name}.pdf'
    version=hashlib.sha256(pdf.read_bytes()).hexdigest()[:12]
    folder=root/'public'/'book-pages'/f'{name}-{version}'
    folder.mkdir(parents=True,exist_ok=True)
    prefix=root/'tmp'/name
    subprocess.run(['pdftoppm','-jpeg','-scale-to','1600',str(pdf),str(prefix)],check=True)
    pages=[]
    for jpg in sorted((root/'tmp').glob(f'{name}-*.jpg')):
        number=int(jpg.stem.split('-')[-1])
        target=folder/f'{number}.webp'
        with Image.open(jpg) as image:
            image.save(target,'WEBP',quality=88,method=5)
            if number==1:
                image.thumbnail((480,480))
                image.save(folder/'cover.webp','WEBP',quality=85,method=5)
        pages.append(number)
        jpg.unlink()
    manifest[f'/ebooks/{name}.pdf']={'numPages':len(pages),'base':f'/book-pages/{name}-{version}','version':version}
    print(name,len(pages),sum(p.stat().st_size for p in folder.glob('*.webp')),flush=True)
(root/'src'/'bookAssets.json').write_text(json.dumps(manifest,indent=2)+'\n')
