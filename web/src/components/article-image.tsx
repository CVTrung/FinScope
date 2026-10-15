'use client';
import {useState} from 'react';
import {CalendarDays,Coins,Newspaper} from 'lucide-react';

export function ArticleImage({src,title,kind='news'}:{src?:string|null;title:string;kind?:string}) {
 const [failed,setFailed]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const Icon=kind==='dividend'?Coins:kind==='news'?Newspaper:CalendarDays;
 return <div className={'article-image '+kind}><div className="image-placeholder"><Icon size={34}/><span>{kind==='news'?'TIN DOANH NGHIỆP':kind==='dividend'?'CỔ TỨC':'CÔNG BỐ THÔNG TIN'}</span></div>{src&&!failed&&
  /* Source-provided public thumbnail; native img supports many publisher hosts. */
  // eslint-disable-next-line @next/next/no-img-element
  <img className={loaded?'loaded':''} src={src} alt={title} loading="lazy" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>}</div>;
}
