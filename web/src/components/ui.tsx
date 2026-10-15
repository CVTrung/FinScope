'use client';
import {MetricChart} from './metric-chart';
import {useState} from 'react';
import {AlertCircle,ArrowDown,ArrowUp,ArrowUpRight,Database,Download,LoaderCircle,Minus,RefreshCw} from 'lucide-react';
import type {DataField,Meta,RatioRow,Zones} from '@/types';
import {csv,date,fmt} from '@/lib/api';
export function Card({title,eyebrow,actions,children,className=''}:{title?:string;eyebrow?:string;actions?:React.ReactNode;children:React.ReactNode;className?:string}) {return <section className={'card '+className}>{(title||actions)&&<div className="card-head"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{actions}</div>}{children}</section>;}
export function Empty({text='Chưa có dữ liệu được xác minh.'}:{text?:string}) {return <div className="empty"><Database size={28}/><p>{text}</p></div>;}
export function State({loading,error,retry,children}:{loading:boolean;error?:Error|null;retry?:()=>void;children?:React.ReactNode}) {
 if(loading)return <div className="loading"><LoaderCircle className="spin" size={22}/><div><strong>Đang tổng hợp dữ liệu</strong><p>Đối chiếu nguồn và kỳ báo cáo. Phân tích AI có thể cần thêm thời gian.</p></div></div>;
 if(error)return <div className="error"><AlertCircle size={22}/><div><strong>{error.message}</strong><p>Không hiển thị số liệu khi chưa lấy được nguồn.</p>{retry&&<button onClick={retry}><RefreshCw size={14}/>Thử lại</button>}</div></div>;
 return <>{children}</>;
}
export function SourceMeta({meta}:{meta?:Meta}) {return meta&&<div className="source-meta"><div className="source-line"><Database size={13}/>{Object.entries(meta.sources_status).map(([s,v])=><span key={s} className={'source '+(v==='ok'?'ok':'warn')}>{s} · {v==='ok'?'Kết nối':v}</span>)}<span>Lấy lúc {date(meta.generated_at)}{meta.cache_hit?' · Cache bộ nhớ':''}</span></div>{meta.warnings.length>0&&<details><summary>Ghi chú dữ liệu ({meta.warnings.length})</summary>{meta.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}</div>;}
export function Value({field,compact=false}:{field?:DataField;compact?:boolean}) {
 if(!field)return <>—</>;
 return <span className={field.discrepancy?'discrepancy':''} title={`${field.chosen_source} · ${field.period||'Kỳ chưa công bố'} · ${field.scope}\nLấy lúc ${date(field.fetched_at)}\n${field.note||''}\n${field.alternates.map(a=>`${a.source}: ${a.value} (${a.period||'khác thời điểm'})`).join('\n')}`}>
 {typeof field.value==='string'?field.value:fmt(field.value,compact?'billion':field.unit)}{field.discrepancy&&<span aria-label="Chênh lệch nguồn"> ⚠</span>}</span>;
}
export function SourceDetail({field}:{field?:DataField}) {return field&&<details className="field-details"><summary>{field.chosen_source==='calculated'?'Tự tính':field.chosen_source} {field.discrepancy?'⚠':''}</summary><div>{field.period||'Kỳ chưa công bố'} · {field.scope}<br/>{date(field.fetched_at)}<p>{field.note}</p>{field.alternates.map((a,i)=><p key={i}>{a.source}: {fmt(a.value,field.unit)} · {a.period||'Chưa rõ kỳ'}</p>)}{field.source_url&&<a href={field.source_url} target="_blank" rel="noreferrer">Mở nguồn ↗</a>}</div></details>;}
export function TrendIndicator({current,previous,unit='number',reference='kỳ trước'}:{current:unknown;previous:unknown;unit?:string;reference?:string}) {
 if(typeof current!=='number'||typeof previous!=='number'||!Number.isFinite(current)||!Number.isFinite(previous))return null;
 const direction=current>previous?'rising':current<previous?'falling':'unchanged';
 const Icon=direction==='rising'?ArrowUp:direction==='falling'?ArrowDown:Minus;
 const label=`${direction==='rising'?'Tăng':direction==='falling'?'Giảm':'Không đổi'} so với ${reference}: ${fmt(previous,unit)} → ${fmt(current,unit)}`;
 return <span className={'metric-direction '+direction} role="img" aria-label={label} title={label}><Icon size={13} strokeWidth={2.5} aria-hidden="true"/></span>;
}
export function RatioTable({rows,title='Hệ số tài chính'}:{rows:RatioRow[];title?:string}) {
 const [sort,setSort]=useState(false);const [filter,setFilter]=useState('');
 const shown=rows.filter(r=>r.label.toLowerCase().includes(filter.toLowerCase()));if(sort)shown.sort((a,b)=>a.label.localeCompare(b.label,'vi'));
 return <Card title={title} actions={<button className="subtle" onClick={()=>csv('FinScope-he-so',[['Chỉ số','Hiện tại','Kỳ trước','Cùng kỳ','TB 3 năm','Trung vị ngành','Đơn vị','Kỳ','Nguồn'],...rows.map(r=>[r.label,r.current.value as number|null,r.previous,r.year_ago,r.average_3y,r.industry_median,r.current.unit,r.current.period,r.current.chosen_source])])}><Download size={15}/>Xuất CSV</button>}>
 <MetricChart rows={rows}/><div className="table-tools"><input aria-label="Lọc chỉ số" placeholder="Lọc chỉ số…" value={filter} onChange={e=>setFilter(e.target.value)}/><button className="subtle" onClick={()=>setSort(!sort)}>Tên {sort?'A → Z':'↕'}</button><span>↑ tăng · ↓ giảm · — không đổi so với kỳ trước. Di chuột vào icon để xem đối chiếu.</span></div>
 <div className="table-scroll"><table><thead><tr>{['Chỉ số','Hiện tại','Kỳ trước','Cùng kỳ','TB 3 năm','Trung vị ngành','Đánh giá','Nguồn'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{shown.map(r=><tr key={r.key}><td>{r.label}</td><td className={'number strong '+(r.assessment==='Tốt'?'heat-good':r.assessment==='Kém'?'heat-bad':'')}>{r.not_applicable?<abbr title={r.current.note||''}>N/A</abbr>:<><TrendIndicator current={r.current.value} previous={r.previous} unit={r.current.unit}/><Value field={r.current}/></>}</td>{[r.previous,r.year_ago,r.average_3y,r.industry_median].map((v,i)=><td className="number" key={i}>{fmt(v,r.current.unit)}</td>)}<td><span className={'tag '+(r.assessment==='Tốt'?'positive':r.assessment==='Kém'?'negative':'')}>{r.assessment==='Tốt'?'● ':r.assessment==='Kém'?'▼ ':r.assessment?'◆ ':''}{r.assessment||'Chưa đủ mẫu'}</span></td><td><SourceDetail field={r.current}/></td></tr>)}</tbody></table></div>{!shown.length&&<Empty/>}
 </Card>;
}
export function ZoneBar({zones,price}:{zones:Zones;price?:number|null}) {
 if(!zones.available||!zones.buy||!zones.sell)return <Empty text={zones.note}/>;
 const lo=zones.buy[0]*.85,hi=zones.sell[1]*1.1;const left=(n:number)=>(n-lo)/(hi-lo)*100;
 return <div className="zones"><div className="zone-total"><span>Giá hợp lý tham khảo</span><strong>{fmt(zones.fair_mid,'VND')} <small>đ / CP</small></strong><span className="tag">Tin cậy {zones.confidence.toLowerCase()}</span></div><div className="zone-track"><div className="buy-zone" style={{left:left(zones.buy[0])+'%',width:(left(zones.buy[1])-left(zones.buy[0]))+'%'}}/><div className="hold-zone" style={{left:left(zones.buy[1])+'%',width:(left(zones.sell[0])-left(zones.buy[1]))+'%'}}/><div className="sell-zone" style={{left:left(zones.sell[0])+'%',width:(left(zones.sell[1])-left(zones.sell[0]))+'%'}}/>{price!=null&&<div className="price-marker" style={{left:Math.min(98,Math.max(2,left(price)))+'%'}}><span>{fmt(price,'VND')}</span></div>}</div><div className="zone-labels"><span><b>Vùng mua</b>{zones.buy.map(v=>fmt(v,'VND')).join(' – ')}</span><span><b>Vùng giữ</b>{zones.hold?.map(v=>fmt(v,'VND')).join(' – ')}</span><span><b>Vùng bán</b>{zones.sell.map(v=>fmt(v,'VND')).join(' – ')}</span></div><p className="muted">{zones.methods.map(m=>m.name).join(' + ')} · {zones.status}</p></div>;
}
export function ExternalLink({href,children}:{href:string;children:React.ReactNode}) {return <a className="external" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={14}/></a>;}
