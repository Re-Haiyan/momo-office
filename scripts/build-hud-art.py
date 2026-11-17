"""Original pixel UI art, authored in rectangles; no third-party game assets."""
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]/'packages/ui/public/art';root.mkdir(exist_ok=True)
for name,outer,edge,inner in [('wood-frame','#3f2c22','#89532f','#d89d55'),('book-frame','#463125','#77503c','#e7c891')]:
 im=Image.new('RGBA',(24,24));d=ImageDraw.Draw(im)
 for box,col in [((0,0,23,23),outer),((2,2,21,21),edge),((4,4,19,19),inner),((6,6,17,17),(0,0,0,0))]:d.rectangle(box,fill=col)
 for x,y in [(2,2),(19,2),(2,19),(19,19)]:d.rectangle((x,y,x+2,y+2),fill='#f4d18b')
 im.save(root/(name+'.png'))
for name,pointer in [('cursor',False),('cursor-hand',True)]:
 im=Image.new('RGBA',(16,16));d=ImageDraw.Draw(im)
 if not pointer:
  d.polygon([(1,0),(1,13),(4,10),(7,15),(10,13),(7,9),(12,9)],fill='#332d23');d.polygon([(2,2),(2,10),(5,8),(7,12),(8,12),(6,7),(9,7)],fill='#ffedc3')
 else:
  d.rectangle((5,1,8,11),fill='#332d23');d.rectangle((2,6,12,13),fill='#332d23');d.rectangle((5,3,6,9),fill='#ffedc3');d.rectangle((4,8,10,12),fill='#ffedc3');d.rectangle((5,13,10,15),fill='#a06c3f')
 im.save(root/(name+'.png'))
im=Image.new('RGBA',(64,16));d=ImageDraw.Draw(im)
# Gear, journal, quests, teammates: four original inventory-slot icons.
d.rectangle((5,2,10,13),fill='#f1d08c');d.rectangle((2,5,13,10),fill='#f1d08c');d.rectangle((4,4,11,11),fill='#f1d08c');d.rectangle((6,6,9,9),fill='#765137')
d.rectangle((19,2,29,13),fill='#c9dfac');d.rectangle((19,2,21,13),fill='#527c62');d.rectangle((23,5,27,5),fill='#527c62');d.rectangle((23,8,27,8),fill='#527c62')
d.rectangle((36,2,45,14),fill='#f2d5a1');d.rectangle((40,4,41,9),fill='#a96939');d.rectangle((40,11,41,12),fill='#a96939')
d.rectangle((51,3,55,7),fill='#dba66e');d.rectangle((58,4,62,8),fill='#e3c591');d.rectangle((49,9,56,14),fill='#7ca07c');d.rectangle((57,10,63,14),fill='#809eab')
im.save(root/'hud-icons.png')
im=Image.new('RGBA',(16,24));d=ImageDraw.Draw(im)
for box,col in [((3,11,12,18),'#9e6336'),((4,10,11,17),'#dfac65'),((2,5,13,13),'#dfac65'),((2,2,5,6),'#dfac65'),((10,2,13,6),'#dfac65'),((3,3,4,5),'#bd7d67'),((11,3,12,5),'#bd7d67'),((13,12,15,16),'#bf864b'),((4,19,6,20),'#f3dba0'),((10,19,12,20),'#f3dba0'),((5,8,6,9),'#273a33'),((10,8,11,9),'#273a33'),((7,11,8,11),'#855042'),((6,13,9,14),'#f3dba0')]:d.rectangle(box,fill=col)
im.save(root/'momo-portrait.png')
