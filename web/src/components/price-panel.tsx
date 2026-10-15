'use client';
import {useMemo,useState} from 'react';
import dynamic from 'next/dynamic';
import type {EChartsOption,SeriesOption,LineSeriesOption} from 'echarts';
import {useAPI} from '@/lib/api';
import {Card,Empty,SourceMeta,State} from './ui';
import type {Prices,Zones} from '@/types';
const Chart=dynamic(()=>import('./chart'),{ssr:false});
function ma(values:number[],size:number) {return values.map((_,i)=>i<size-1?null:values.slice(i-size+1,i+1).reduce((a,b)=>a+b,0)/size);}
function rsi(values:number[],size=14) {return values.map((_,i)=>{if(i<size)return null;let gain=0,loss=0;for(let j=i-size+1;j<=i;j++){const d=values[j]-values[j-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}return loss===0?100:100-100/(1+gain/loss);});}
export default function PricePanel({ticker,source='auto',zones}:{ticker:string;source?:string;zones?:Zones}) {
 const [range,setRange]=useState('1y');const [candles,setCandles]=useState(false);const [showMa,setShowMa]=useState(true);const [showRsi,setShowRsi]=useState(false);
 const query=useAPI<Prices>(`/company/${ticker}/prices?range=${range}&source=${source}`);
 const option=useMemo<EChartsOption>(()=>{const items=query.data?.data.items||[];const closes=items.map(p=>p.close);const markArea:LineSeriesOption['markArea']=zones?.available?{silent:true,data:[[{yAxis:zones.buy?.[0],itemStyle:{color:'#0d948814'}},{yAxis:zones.buy?.[1]}],[{yAxis:zones.sell?.[0],itemStyle:{color:'#df657214'}},{yAxis:zones.sell?.[1]}]]}:undefined;const main:SeriesOption=candles?{name:ticker,type:'candlestick',data:items.map(p=>[p.open??p.close,p.close,p.low??p.close,p.high??p.close]),itemStyle:{color:'#0d9488',color0:'#df6572',borderColor:'#0d9488',borderColor0:'#df6572'},markArea}:{name:ticker,type:'line',data:closes,symbol:'none',smooth:true,lineStyle:{width:2.5},areaStyle:{color:echartsGradient()},markArea};return {
  animationDuration:450,color:['#0d9488','#e9ae53','#7c83e4'],tooltip:{trigger:'axis'},grid:[{left:58,right:20,top:20,height:showRsi?'48%':'64%'},{left:58,right:20,top:showRsi?'66%':'80%',height:'12%'},...(showRsi?[{left:58,right:20,top:'85%',height:'12%'}]:[])],
  xAxis:[0,1,...(showRsi?[2]:[])].map((n)=>({type:'category' as const,data:items.map(p=>p.date),gridIndex:n,axisLine:{show:false},axisTick:{show:false},axisLabel:{show:n===0,color:'#8a98a5',formatter:(v:string)=>v.slice(5)}})),
  yAxis:[{type:'value',scale:true,axisLabel:{color:'#8a98a5',formatter:(v:number)=>(v/1000).toFixed(1)+'k'},splitLine:{lineStyle:{color:'#8a98a51b'}}},{type:'value',gridIndex:1,axisLabel:{show:false},splitLine:{show:false}},...(showRsi?[{type:'value' as const,gridIndex:2,min:0,max:100,axisLabel:{show:false},splitLine:{show:false}}]:[])],
  series:[main,
   ...(showMa?[{name:'MA50',type:'line' as const,data:ma(closes,50),symbol:'none',lineStyle:{width:1,type:'dashed' as const}},{name:'MA200',type:'line' as const,data:ma(closes,200),symbol:'none',lineStyle:{width:1}}]:[]),
   {name:'Khối lượng',type:'bar',xAxisIndex:1,yAxisIndex:1,data:items.map((p,i)=>({value:p.volume,itemStyle:{color:i&&p.close<items[i-1].close?'#df657244':'#0d948844'}}))},
   ...(showRsi?[{name:'RSI14 (SMA)',type:'line' as const,xAxisIndex:2,yAxisIndex:2,data:rsi(closes),symbol:'none',lineStyle:{color:'#7c83e4',width:1.5}}]:[])]};},[query.data,ticker,candles,showMa,showRsi,zones]);
 return <Card title="Diễn biến giá" eyebrow={ticker+' · GIÁ & KHỐI LƯỢNG'} actions={<div className="segmented">{[['1mo','1T'],['3mo','3T'],['6mo','6T'],['1y','1N'],['5y','5N']].map(([v,l])=><button key={v} className={range===v?'selected':''} onClick={()=>setRange(v)}>{l}</button>)}</div>}>
 <div className="chart-toolbar"><span className="chart-legend"><i/>{ticker}<span className="muted">VND / cổ phiếu</span></span><div><button className={candles?'active-text':''} onClick={()=>setCandles(!candles)}>Nến</button><button className={showMa?'active-text':''} onClick={()=>setShowMa(!showMa)}>MA</button><button className={showRsi?'active-text':''} onClick={()=>setShowRsi(!showRsi)}>RSI</button></div></div>
 <State loading={query.isPending} error={query.error} retry={()=>query.refetch()}>{query.data?.data.items.length?<Chart option={option} height={340} label={'Biểu đồ giá và khối lượng '+ticker}/>:<Empty text={query.data?.data.note}/>}</State><SourceMeta meta={query.data?.meta}/>
 </Card>;
}
// ECharts accepts this serializable gradient without importing the rendering engine in the server bundle.
function echartsGradient(){return {type:'linear' as const,x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#0d948832'},{offset:1,color:'#0d948800'}]};}
