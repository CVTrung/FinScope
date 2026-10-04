import fs from 'node:fs/promises';
import { vietstockSession, parseVietstockFinancials } from '../server/vietstock.js';
const session = await vietstockSession({query:'HPG', signal:AbortSignal.timeout(45000)});
const results = [];
for (const page of [1,2,3]) {
 const data = await session.post('/data/financeinfo', {Code:session.company.ticker,Page:page,PageSize:12,ReportTermType:2,ReportType:'BCTQ',Unit:1});
 const result = {page,columns:data?.[0]?.map(column=>({id:column.ID,start:column.PeriodBegin,end:column.PeriodEnd,scope:column.United})),financials:parseVietstockFinancials(data,'quarterly','D3')};
 results.push(result);
 console.log(JSON.stringify({page,columns:result.columns}));
}
await fs.writeFile('artifacts/vietstock-quarterly-pagination.json',JSON.stringify({ticker:session.company.ticker,retrievedAt:new Date().toISOString(),requestedPageSize:12,results},null,2));
