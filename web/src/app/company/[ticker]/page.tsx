import Company from '@/components/company';
export default async function Page({params}:{params:Promise<{ticker:string}>}) {const {ticker}=await params;return <Company ticker={ticker.toUpperCase()}/>;}
