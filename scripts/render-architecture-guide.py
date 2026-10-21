from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import re
root=Path('reports/project-cleanup-20261018')
font='C:/Windows/Fonts/msyh.ttc'
def f(n):return ImageFont.truetype(font,n)
def draw(name,title,branches):
    w=1800;h=180+len(branches)*142
    im=Image.new('RGB',(w,h),'#f4f7fc');d=ImageDraw.Draw(im)
    d.text((65,35),title,font=f(42),fill='#173c80')
    cy=(h+150)//2
    d.rounded_rectangle((60,cy-70,390,cy+70),24,fill='#173c80')
    d.text((95,cy-40),'海外运维',font=f(35),fill='white')
    d.text((95,cy+6),'横向管理平台' if name=='platform' else ('项目业务层级' if name=='project' else '协同中枢'),font=f(35),fill='white')
    colors=['#3264bd','#168d88','#5276c9','#8070b9','#2c839f','#6e7c8d']
    ys=[185+i*142 for i in range(len(branches))]
    d.line([(390,cy),(445,cy)],fill='#a7b7d0',width=4)
    d.line([(445,ys[0]),(445,ys[-1])],fill='#a7b7d0',width=4)
    for i,(head,details) in enumerate(branches):
        y=ys[i];c=colors[i%len(colors)]
        d.line([(445,y),(490,y)],fill='#a7b7d0',width=4)
        d.rounded_rectangle((490,y-47,1005,y+47),18,fill=c)
        d.text((517,y-23),head,font=f(33),fill='white')
        d.line([(1005,y),(1060,y)],fill='#a7b7d0',width=4)
        d.rounded_rectangle((1060,y-52,1740,y+52),15,fill='white',outline='#dce4f0',width=2)
        for j,s in enumerate(details):d.text((1084,y-38+j*44),s,font=f(28),fill='#35465f')
    im.save(root/(name+'.png'))
draw('platform','01  平台总架构 · 六个一级模块',[
 ('00 项目总览',['架构指南、项目台账','项目业务统一在横向平台管理']),
 ('01 海外运维指南',['知识标准、EHS资料、经验与培训','工作模板、共用调研']),
 ('02 泰国项目',['项目前置统筹：测试前置、运维提前介入','项目筹备、接维、运维、会议、人员']),
 ('03 马来项目',['项目前置统筹：测试前置、运维提前介入','项目筹备、接维、运维、会议、人员']),
 ('04 协同中枢',['会议决策、协同事项','资源统筹、风险联动']),
 ('90 历史来源归档',['接维测试历史、日常运维历史','旧版整理底稿、原架构索引'])])
def draw_projects():
    im=Image.new('RGB',(1800,1320),'#f4f7fc');d=ImageDraw.Draw(im)
    d.rounded_rectangle((560,25,1240,115),22,fill='#173c80')
    d.text((625,48),'海外运维横向管理平台',font=f(38),fill='white')
    modules=[
        ('项目前置统筹','测试前置、运维提前介入','项目任务、人员资料、商务成本：17表'),
        ('项目筹备','调研问题、调研明细、调研证据','收集需求，保留现场依据'),
        ('接维开服','初始化工作、交付界面、测试验收','管理接维与开服执行'),
        ('日常运维','例行工作、服务核查、问题整改','EHS工作清单'),
        ('会议报告','项目会议、项目报告','本项目议题、纪要与报告'),
        ('人员培训','项目人员、培训记录','运行期人员与培训管理')]
    for x,code,country in [(95,'02','泰国项目'),(970,'03','马来项目')]:
        d.line([(900,115),(900,140),(x+365,140),(x+365,160)],fill='#a7b7d0',width=4)
        d.rounded_rectangle((x,160,x+735,245),18,fill='#168d88')
        d.text((x+230,181),code+' '+country,font=f(35),fill='white')
        d.line([(x+365,245),(x+365,260),(x-20,260),(x-20,1105)],fill='#a7b7d0',width=4)
        for i,(title,line1,line2) in enumerate(modules,1):
            y=285+(i-1)*142;c='#173c80' if i==1 else '#3264bd'
            d.line([(x-20,y+55),(x,y+55)],fill='#a7b7d0',width=4)
            d.rounded_rectangle((x,y,x+735,y+118),16,fill='white',outline='#dce4f0',width=2)
            d.text((x+22,y+13),f'{code}.{i:02d}  {title}',font=f(31),fill=c)
            d.text((x+22,y+58),line1,font=f(25),fill='#35465f')
            d.text((x+22,y+88),line2,font=f(24),fill='#66768c')
    d.rounded_rectangle((95,1170,1705,1290),16,fill='#e8effa')
    d.text((125,1188),'编码示例：02 泰国项目 → 02.01 项目前置统筹 → 02.01.03 任务执行底表',font=f(28),fill='#173c80')
    d.text((125,1235),'对应结构：03 马来项目 → 03.01 项目前置统筹 → 03.01.03 任务执行底表',font=f(28),fill='#173c80')
    im.save(root/'project.png')
draw_projects()
draw('hub','03  协同中枢 · 四组并行协作',[
 ('04.01 会议决策',['团队例会、跨项目议题与决策','会议记录保留来源链接']),
 ('04.02 协同事项',['共性问题、专项工作、经验推广','牵头人、协同人员、目标日期与结果']),
 ('04.03 资源统筹',['人员专家、物资供应商、工具系统','资源需求、协调安排与落实结果']),
 ('04.04 风险联动',['跨项目影响、风险等级与应对措施','明确牵头、升级和关闭情况'])])
xml=(root/'architecture-guide.xml').read_text(encoding='utf8')
xml=re.sub(r'<title>.*?</title>','',xml)
for key in ['platform','project','hub']:
    xml=re.sub(r'<whiteboard[^>]*>.*?</whiteboard>',f'<p>【{key}图示】</p>',xml,count=1,flags=re.S)
xml=re.sub(r'<cite[^>]*></cite>','<a href="https://vnet.feishu.cn/base/FmIwbCqj1ax5MvsTp5OcPO5lnue?table=ldxQTOrMHIaG4vuR">项目管理工作区</a>',xml)
(root/'architecture-guide.html').write_text(xml,encoding='utf8')
