import {useQuery} from '@tanstack/react-query';
import type {Envelope} from '@/types';
export const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';
export async function fetchAPI<T>(path:string, signal?:AbortSignal):Promise<Envelope<T>> {
  const response = await fetch(API+path,{signal});
  const result = await response.json();
  if(!response.ok) throw new Error(result.error?.message || 'Không thể kết nối nguồn dữ liệu.');
  return result as Envelope<T>;
}
export function useAPI<T>(path:string, enabled=true) {
  return useQuery({queryKey:[path],queryFn:({signal})=>fetchAPI<T>(path,signal),enabled,staleTime:90000,retry:1});
}
export function fmt(value:unknown,unit='number',digits=2):string {
  if(value===null||value===undefined||typeof value!=='number'||!Number.isFinite(value)) return '—';
  if(unit==='ratio') return new Intl.NumberFormat('vi-VN',{style:'percent',maximumFractionDigits:digits}).format(value);
  if(unit==='billion') return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(value/1e9);
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:unit==='VND'||unit==='shares'?0:digits}).format(value);
}
export function date(value?:string|null):string { return value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}):'Chưa rõ thời điểm'; }
export function csv(name:string,rows:(string|number|null)[][]) {
 const content='\ufeff'+rows.map(row=>row.map(v=>'"'+(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:String(v??'')).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));
 const link=document.createElement('a');link.href=url;link.download=name+'.csv';link.click();URL.revokeObjectURL(url);
}

export function dateOnly(value?:string|null):string {return value?new Date(value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}):'Chưa rõ ngày';}
