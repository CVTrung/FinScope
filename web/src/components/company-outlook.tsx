'use client';
import {Sparkles} from 'lucide-react';
import type {Digest} from '@/types';
import {useAPI} from '@/lib/api';
import {Card,Empty,State} from './ui';

export function CompanyOutlook({ticker,source='auto'}:{ticker:string;source?:string}) {
 const enabled=['auto','simplize'].includes(source);
 const q=useAPI<Digest>(`/company/${ticker}/news-digest`,enabled);
 if(!enabled)return null;
 return <Card title={'Toàn cảnh nhanh · '+ticker} eyebrow="CHIỀU HƯỚNG & SỰ KIỆN CÓ THỂ ĐỔI CHIỀU · 30 NGÀY" className="company-outlook" actions={<button className="button" disabled={q.isFetching} onClick={()=>q.refetch()}><Sparkles size={15}/>{q.isFetching?'Đang tổng hợp…':'Cập nhật nhận xét'}</button>}><State loading={q.isPending} error={q.error} retry={()=>q.refetch()}>{q.data?.data.available?<div className="digest-sections">{q.data.data.result?.sections?.map((section,i)=><section key={i}><h3>{section.title}</h3><ul>{section.bullets.map((bullet,j)=><li key={j}>{bullet}</li>)}</ul></section>)}</div>:<Empty text={q.data?.data.reason}/>}</State></Card>;
}
