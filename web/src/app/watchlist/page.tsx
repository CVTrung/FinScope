'use client';
import Link from 'next/link';
import {ArrowUpRight,Bookmark} from 'lucide-react';
import {useSaved} from '@/components/shell';
import StockTable from '@/components/stock-table';
import {Card} from '@/components/ui';
export default function Page(){const {watchlist}=useSaved();return <><div className="page-heading"><div><span className="eyebrow">KHÔNG GIAN CÁ NHÂN</span><h1>Danh sách theo dõi<span className="teal">.</span></h1><p>Lưu trên trình duyệt của bạn. Không cần đăng nhập.</p></div><span className="tag"><Bookmark size={14}/>{watchlist.length} doanh nghiệp</span></div><Card title="Doanh nghiệp bạn quan tâm" actions={<Link className="subtle" href="/">Khám phá thêm<ArrowUpRight size={15}/></Link>}><StockTable tickers={watchlist} withScores/></Card><p className="muted">Danh sách sẽ được giữ khi tải lại trang trên cùng trình duyệt; xóa dữ liệu trình duyệt sẽ xóa danh sách.</p></>;}
