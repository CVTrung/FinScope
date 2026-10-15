'use client';
import {useState} from 'react';
import {ArrowUpRight,Newspaper,Sparkles} from 'lucide-react';
import {dateOnly,useAPI} from '@/lib/api';
import {ArticleImage} from './article-image';
import {CompanyOutlook} from './company-outlook';
import {Card,Empty,SourceMeta,State} from './ui';
import {ImpactBadge,ReviewContent} from './review';
import type {Digest,ItemReview,News,NewsItem,Reviews} from '@/types';

export function NewsPanel({ticker,source='auto'}:{ticker:string;source?:string}) {
 const [days,setDays]=useState('90');
 const q=useAPI<News>(`/company/${ticker}/news?days=${days}&source=${source}`);
 const reviews=useAPI<Reviews>(`/company/${ticker}/news-reviews`,Boolean(q.data?.data.items.length)&&['auto','simplize'].includes(source));
 const map=new Map(reviews.data?.data.result?.items.map(r=>[r.id,r]));
 return <div className="news-workspace"><div className="panel-controls"><div className="section-label"><Newspaper size={21}/><div><h2>Tin báo chí</h2><p className="muted">Nội dung bài viết, nguồn gốc và ảnh hưởng từ AI</p></div></div><div className="controls-right"><select aria-label="Khoảng thời gian tin" value={days} onChange={e=>setDays(e.target.value)}><option value="30">30 ngày</option><option value="90">90 ngày</option></select></div></div>
 <CompanyOutlook ticker={ticker} source={source}/>
 <State loading={q.isPending} error={q.error} retry={()=>q.refetch()}><div className="news-note"><Sparkles size={18}/><div><p>{q.data?.data.note}</p><p>{reviews.isFetching?'AI đang đọc và đánh giá các tin; bạn vẫn có thể xem nội dung nguồn.':reviews.data?.data.available?`Đã đánh giá ${map.size} tin · ${reviews.data.data.model_used}`:reviews.data?.data.reason||reviews.error?.message}</p>{!reviews.isFetching&&(!reviews.data?.data.available||Boolean(reviews.data?.data.reason))&&<button className="primary" onClick={()=>reviews.refetch()}>Thử lại đánh giá AI</button>}</div></div>
 <div className="section-divider"><span>DÒNG TIN DOANH NGHIỆP</span><p>Mỗi bản tin gồm tóm tắt, ảnh hưởng và nguồn đối chiếu.</p></div><div className="news-list">{q.data?.data.items.map(article=><Article key={article.id} article={article} ticker={ticker} review={map.get(article.id)} pending={reviews.isFetching}/>)}</div>{!q.data?.data.items.length&&<Card><Empty text="Chưa có tin trong khoảng thời gian đã chọn."/></Card>}<SourceMeta meta={q.data?.meta}/></State></div>;
}

function Article({article,ticker,review,pending}:{article:NewsItem;ticker:string;review?:ItemReview;pending:boolean}) {
 const [expanded,setExpanded]=useState(false);const q=useAPI<Digest>(`/company/${ticker}/news/${article.id}/summary`,expanded);const publisher=article.sources[0];
 return <article className="news-card" id={'news-'+article.id}><div className="article-overview"><ArticleImage src={article.image_url} title={article.headline}/><div className="article-copy"><div className="news-date"><time>{dateOnly(article.published_at)}</time><span className="tag soft">{publisher?.publisher||'Nguồn tin'}</span><ImpactBadge review={review} pending={pending}/></div><h2>{article.headline}</h2>{review?<ReviewContent review={review}/>:<p className="article-summary"><b>Trích yếu từ nguồn</b>{article.description||'Đang đọc nội dung chi tiết.'}</p>}</div></div><div className="news-actions"><button className="button" onClick={()=>setExpanded(!expanded)}><Sparkles size={15}/>{expanded?'Thu gọn':'AI phân tích'}</button><a href={publisher?.url} target="_blank" rel="noreferrer" title={publisher?.note}>{publisher?.type==='original'?'Bài gốc: ':'Nguồn tổng hợp: '}{publisher?.publisher||publisher?.name}<ArrowUpRight size={14}/></a></div>{expanded&&<div className="news-expanded"><State loading={q.isPending} error={q.error} retry={()=>q.refetch()}>{q.data?.data.available?<><div className="source-line"><span className="tag">{q.data.data.model_used}</span><span>{article.content_level==='article'?'Dựa trên nội dung chi tiết do nguồn cung cấp.':'Giới hạn ở mô tả nguồn.'}</span></div>{([['context','Bối cảnh'],['key_developments','Diễn biến chính'],['key_figures','Số liệu quan trọng'],['impact','Tác động'],['watch_next','Điểm cần theo dõi']] as const).map(([key,title])=><div key={key}><h3>{title}</h3><p>{q.data?.data.result?.[key]}</p></div>)}</>:<Empty text={q.data?.data.reason}/>}</State></div>}</article>;
}
