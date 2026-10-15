import asyncio,httpx,json,pathlib,time
async def main():
 async with httpx.AsyncClient(base_url='http://127.0.0.1:8000',timeout=120) as c:
  for name,path in [('market','/api/market/overview'),('annual','/api/company/VNM/financials?period=year'),('analysis','/api/company/VNM/analysis'),('news','/api/company/VNM/news'),('ownership','/api/company/VNM/ownership'),('events','/api/company/VNM/events'),('compare','/api/compare?tickers=VNM,FPT'),('unknown','/api/company/ZZZZZZ/overview')]:
   t=time.time();r=await c.get(path)
   try: data=r.json()
   except ValueError: data={'error':'non-json'}
   pathlib.Path('artifacts/live-'+name+'.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
   print(name,r.status_code,round(time.time()-t,2),'bytes',len(r.content),flush=True)
   if name=='news' and data.get('data',{}).get('items'):
    items=data['data']['items'];row=next((x for x in items if len(x['description'].split())>=35),items[0]);rr=await c.get('/api/company/VNM/news/'+row['id']+'/summary');j=rr.json();pathlib.Path('artifacts/live-news-summary.json').write_text(json.dumps(j,ensure_ascii=False,indent=2),encoding='utf-8');print('news summary',rr.status_code,j.get('data',{}).get('available'),flush=True)
asyncio.run(main())
