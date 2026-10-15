import asyncio,httpx,sys,json,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'api'))
from app.ai.client import Gemini
from app.ai.schemas import Analysis
async def main():
 async with httpx.AsyncClient() as client:
  result=await Gemini(client).generate({'ticker':'VNM','roe':0.3077738764013842,'industry_roe':0.18,'scoring':{'strengths':[{'indicator':'roe','value':0.3077738764013842}],'weaknesses':[]}},Analysis,{'roe'},'analysis')
  safe={k:v for k,v in result.items() if k!='result'}
  print(json.dumps(safe,ensure_ascii=True));pathlib.Path('artifacts/gemini-live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
