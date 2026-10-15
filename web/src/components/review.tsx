'use client';
import {Sparkles} from 'lucide-react';
import type {ItemReview} from '@/types';
const labels={positive:'Tích cực',negative:'Tiêu cực',neutral:'Trung tính',mixed:'Đa chiều',uncertain:'Chưa đủ cơ sở'};
export function ImpactBadge({review,pending=false}:{review?:ItemReview;pending?:boolean}) {
 return <span className={'tag impact-badge '+(review?.sentiment==='positive'?'positive':review?.sentiment==='negative'?'negative':review?.sentiment==='mixed'?'mixed':'')}><Sparkles size={12}/>{review?labels[review.sentiment]:pending?'AI đang đọc tin…':'AI chưa trả kết quả'}</span>;
}
export function ReviewContent({review}:{review:ItemReview}) {
 return <div className="review-content"><div><h3>Tóm tắt AI</h3><ul>{review.summary.map((s,i)=><li key={i}>{s}</li>)}</ul></div><div className="impact-box"><ImpactBadge review={review}/><h3>Ảnh hưởng tới doanh nghiệp</h3><p>{review.impact}</p><h3>Cần theo dõi</h3><p>{review.watch_next}</p></div></div>;
}
