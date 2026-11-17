"""Rebuild the bundled BMFont atlas from OFL Silkscreen (Pillow required)."""
from PIL import Image,ImageFont,ImageDraw
from pathlib import Path
from xml.etree.ElementTree import Element,SubElement,ElementTree
root=Path(__file__).resolve().parents[1]/'packages/ui/public/fonts'
font=ImageFont.truetype(str(root/'Silkscreen-Regular.ttf'),8)
chars=''.join(chr(c) for c in range(32,127))+'’‘“”–—…·↑↓←→✓✦'
im=Image.new('1',(256,128),0);draw=ImageDraw.Draw(im)
xm=Element('font');SubElement(xm,'info',face='Silkscreen',size='8');SubElement(xm,'common',lineHeight='11',base='8',scaleW='256',scaleH='128',pages='1',packed='0');pages=SubElement(xm,'pages');SubElement(pages,'page',id='0',file='silkscreen.png');items=SubElement(xm,'chars',count=str(len(chars)))
for i,c in enumerate(chars):
 x=i%16*16;y=i//16*16;draw.text((x,y),c,font=font,fill=1)
 SubElement(items,'char',id=str(ord(c)),x=str(x),y=str(y),width='16',height='11',xoffset='0',yoffset='0',xadvance=str(round(font.getlength(c))),page='0',chnl='15')
rgba=Image.new('RGBA',im.size,(255,240,192,0));rgba.putalpha(im.convert('L'));rgba.save(root/'silkscreen.png');ElementTree(xm).write(root/'silkscreen.xml',encoding='utf-8',xml_declaration=True)

ink=Image.new('RGBA',im.size,(54,44,36,0));ink.putalpha(im.convert('L'));ink.save(root/'silkscreen-ink.png')
xm.find('pages/page').set('file','silkscreen-ink.png');ElementTree(xm).write(root/'silkscreen-ink.xml',encoding='utf-8',xml_declaration=True)
