'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
import type {RatioRow,StatementTable} from '@/types';
const Chart=dynamic(()=>import('./chart'),{ssr:false});

export function MetricChart({rows}:{rows:RatioRow[]}) {
 const [key,setKey]=useState('roe');
 const row=rows.find(r=>r.key===key)||rows[0];
 if(!row)return null;
 const percent=row.current.unit==='ratio';
 const values=[row.year_ago,row.previous,row.current.value,row.industry_median].map(v=>typeof v==='number'?v*(percent?100:1):null);
 return <div className="metric-explorer"><label>Biểu đồ theo chỉ số <select aria-label="Chỉ số biểu đồ hệ số" value={row.key} onChange={e=>setKey(e.target.value)}>{rows.filter(r=>!r.not_applicable).map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label><Chart height={230} label={'Biểu đồ '+row.label} option={{tooltip:{trigger:'axis'},grid:{left:65,right:20,top:25,bottom:35},xAxis:{type:'category',data:['Cùng kỳ','Kỳ trước','Hiện tại','Trung vị ngành'],axisLabel:{color:'#8a98a5'}},yAxis:{type:'value',name:percent?'%':row.current.unit,axisLabel:{color:'#8a98a5'},splitLine:{lineStyle:{color:'#8a98a51b'}}},series:[{name:row.label,type:'bar',barMaxWidth:48,data:values.map((value,i)=>({value,itemStyle:{color:['#a6b8c8','#809bb3','#0d9488','#a692d6'][i],borderRadius:[5,5,0,0]}}))}]}}/><p className="muted">{row.label} · {row.current.period} · Khoảng trống là dữ liệu thiếu. Trung vị ngành chỉ hiển thị khi đủ mẫu cùng kỳ.</p></div>;
}

export function StatementChart({table}:{table:StatementTable}) {
 const [key,setKey]=useState('');
 const row=table.rows.find(r=>r.key===key)||table.rows[0];
 if(!row)return null;
 const money=row.values[0]?.unit==='VND';
 return <div className="metric-explorer"><label>Vẽ chỉ tiêu <select aria-label="Chỉ tiêu biểu đồ báo cáo" value={row.key} onChange={e=>setKey(e.target.value)}>{table.rows.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label><Chart height={240} label={'Lịch sử '+row.label} option={{color:['#0d9488'],tooltip:{trigger:'axis'},grid:{left:70,right:25,top:25,bottom:35},xAxis:{type:'category',data:[...table.periods].reverse(),axisLabel:{color:'#8a98a5'}},yAxis:{type:'value',name:money?'Tỷ đồng':row.values[0]?.unit,axisLabel:{color:'#8a98a5'},splitLine:{lineStyle:{color:'#8a98a51b'}}},series:[{type:'bar',name:row.label,barMaxWidth:38,data:[...row.values].reverse().map(v=>typeof v.value==='number'?{value:v.value/(money?1e9:1),itemStyle:{color:v.value<0?'#dc6374':'#0d9488',borderRadius:[4,4,0,0]}}:null)}]}}/><p className="muted">Biểu đồ số tuyệt đối theo kỳ báo cáo · {row.label}. Đổi chỉ tiêu để xem xu hướng.</p></div>;
}
