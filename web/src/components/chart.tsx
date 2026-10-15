'use client';
import {useEffect,useRef} from 'react';
import * as echarts from 'echarts';
import type {EChartsOption} from 'echarts';
export default function Chart({option,height=300,label}:{option:EChartsOption;height?:number;label:string}) {
 const element=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!element.current)return;const chart=echarts.init(element.current);chart.setOption(option);const observer=new ResizeObserver(()=>chart.resize());observer.observe(element.current);return()=>{observer.disconnect();chart.dispose();};},[option]);
 return <div ref={element} style={{height,width:'100%'}} role="img" aria-label={label}/>;
}
