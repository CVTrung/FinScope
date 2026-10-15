import type {Metadata} from 'next';
import Providers from '@/components/shell';
import './globals.css';
export const metadata:Metadata={title:'FinScope — Góc nhìn tài chính rõ ràng',description:'Tra cứu, phân tích và đối chiếu dữ liệu doanh nghiệp Việt Nam. Công cụ phục vụ học tập.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="vi" suppressHydrationWarning><body><Providers>{children}</Providers></body></html>;}
