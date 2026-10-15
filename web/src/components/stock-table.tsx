'use client';
import Link from 'next/link';
import {useQueries} from '@tanstack/react-query';
import {ArrowUpRight,Bookmark,X} from 'lucide-react';
import {fetchAPI,fmt,useAPI} from '@/lib/api';
import type {Analysis,Overview} from '@/types';
import {useSaved} from './shell';
import {Empty,SourceDetail,Value} from './ui';
export default function StockTable({tickers,withScores=false}:{tickers:string[];withScores?:boolean}) {
 const {watchlist,toggle}=useSaved();const queries=useQueries({queries:tickers.map(t=>({queryKey:[`/company/${t}/overview?source=auto`],queryFn:({signal}:{signal:AbortSignal})=>fetchAPI<Overview>(`/company/${t}/overview?source=auto`,signal),staleTime:90000,retry:1}))});
 if(!tickers.length)return <Empty text="Chưa có mã theo dõi. Tìm doanh nghiệp rồi bấm Theo dõi để lưu trên trình duyệt này."/>;
 return <div className="table-scroll"><table className="stock-table"><thead><tr><th>Doanh nghiệp</th><th>Giá · VND</th><th>Thay đổi</th><th>Vốn hóa · tỷ</th><th>P/E</th><th>P/B</th><th>ROE</th>{withScores&&<th>Điểm tổng hợp</th>}<th>Nguồn giá / kỳ</th><th aria-label="Theo dõi"/></tr></thead><tbody>{queries.map((q,i)=>{const d=q.data?.data;return <tr key={tickers[i]}><td><Link href={'/company/'+tickers[i]} className="stock-name"><span className={'stock-icon color-'+i%4}>{tickers[i].slice(0,3)}</span><span><b>{tickers[i]}<small>{d?.exchange}</small></b><span>{d?.name|| (q.error?'Chưa lấy được dữ liệu':'Đang tải doanh nghiệp…')}</span></span></Link></td><td className="number strong"><Value field={d?.kpis.price}/></td><td className={'number '+(Number(d?.change_percent.value)>=0?'up':'down')}>{Number(d?.change_percent.value)>0?'+':''}{fmt(d?.change_percent.value,'ratio')}</td><td className="number"><Value field={d?.kpis.market_cap} compact/></td><td className="number"><Value field={d?.kpis.pe}/></td><td className="number"><Value field={d?.kpis.pb}/></td><td className="number"><Value field={d?.kpis.roe}/></td>{withScores&&<td className="number"><ScoreCell ticker={tickers[i]}/></td>}<td>{d?<SourceDetail field={d.kpis.price}/>:q.error?<button className="subtle" onClick={()=>q.refetch()}>Thử lại</button>:<span className="skeleton-line"/>}</td><td><button aria-label={(watchlist.includes(tickers[i])?'Bỏ theo dõi ':'Theo dõi ')+tickers[i]} className="icon-button" onClick={()=>toggle(tickers[i])}>{watchlist.includes(tickers[i])?<X size={17} className="down"/>:<Bookmark size={17}/>}</button></td></tr>;})}</tbody></table><div className="table-foot"><span>Chỉ số P/E, P/B, ROE trong bảng là số nguồn công bố; mở doanh nghiệp để xem số tự tính và kỳ báo cáo.</span><ArrowUpRight size={16}/></div></div>;
}

function ScoreCell({ticker}:{ticker:string}){const q=useAPI<Analysis['scoring']>(`/company/${ticker}/score`);return <span title={`Code tính · độ phủ ${fmt(q.data?.data.coverage,'ratio')}`}>{q.isFetching?'…':fmt(q.data?.data.total,'number',0)}</span>;}
