// Add ticker/name variants here when a company uses another name in news articles.
export const companyAliases = {
  HPG: ['Hòa Phát', 'Hoa Phat Group'],
  FPT: ['FPT Corporation'],
  VNM: ['Vinamilk', 'Vietnam Dairy Products'],
  VCB: ['Vietcombank'],
  BID: ['BIDV'],
  CTG: ['VietinBank'],
  TCB: ['Techcombank'],
  MBB: ['MBBank', 'MB Bank', 'Ngân hàng Quân đội'],
  ACB: ['Ngân hàng Á Châu', 'Asia Commercial Bank'],
  VPB: ['VPBank'],
  STB: ['Sacombank'],
  HDB: ['HDBank'],
  SHB: ['Ngân hàng Sài Gòn Hà Nội'],
  VIB: ['Ngân hàng Quốc tế', 'Vietnam International Bank'],
  TPB: ['TPBank', 'Ngân hàng Tiên Phong'],
  EIB: ['Eximbank'],
  LPB: ['LPBank', 'LienVietPostBank'],
  VIC: ['Vingroup'],
  VHM: ['Vinhomes'],
  VRE: ['Vincom Retail'],
  MSN: ['Masan'],
  MWG: ['Thế Giới Di Động', 'Mobile World'],
  PNJ: ['Phú Nhuận Jewelry', 'Phu Nhuan Jewelry'],
  SAB: ['Sabeco'],
  GAS: ['PV GAS', 'PetroVietnam Gas'],
  PLX: ['Petrolimex'],
  POW: ['PV Power', 'PetroVietnam Power'],
  GVR: ['Tập đoàn Cao su Việt Nam', 'Vietnam Rubber Group'],
  HSG: ['Hoa Sen Group', 'Tập đoàn Hoa Sen'],
  NKG: ['Thép Nam Kim', 'Nam Kim Steel'],
  DGC: ['Hóa chất Đức Giang', 'Duc Giang Chemicals'],
  DPM: ['Đạm Phú Mỹ', 'Phu My Fertilizer'],
  DCM: ['Đạm Cà Mau', 'Ca Mau Fertilizer'],
  VJC: ['Vietjet'],
  HVN: ['Vietnam Airlines'],
  REE: ['Cơ điện lạnh', 'Refrigeration Electrical Engineering'],
};

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsPhrase(text, phrase) {
  return Boolean(phrase) && ` ${text} `.includes(` ${phrase} `);
}

const companies = Object.entries(companyAliases).map(([ticker, aliases]) => ({
  names: [ticker, ...aliases],
  normalized: [ticker, ...aliases].map(normalize),
}));

function findCompanies(query) {
  const text = normalize(query);
  return companies.filter((company) =>
    company.normalized.some((name) => containsPhrase(text, name)),
  );
}

export function buildNewsSearchQuery(query) {
  const original = String(query).trim().replace(/\s+/g, ' ');
  const names = findCompanies(original).flatMap((company) =>
    company.names[0] === 'GAS'
      ? ['PV GAS', 'PetroVietnam Gas', 'cổ phiếu GAS']
      : company.names.slice(0, 2),
  );
  if (!names.length) return `"${original.replace(/"/g, '')}"`;
  const unique = [...new Set(names)];
  // Google supports OR: an article can mention the ticker OR the company name.
  let expanded = '';
  for (const name of unique) {
    const term = /\s/.test(name) ? `"${name}"` : name;
    const next = expanded ? `${expanded} OR ${term}` : term;
    if (next.length <= 400) expanded = next;
  }
  return `(${expanded})`;
}
const genericWords = new Set([
  'cong',
  'ty',
  'co',
  'phan',
  'tap',
  'doan',
  'company',
  'corporation',
  'group',
  'stock',
  'shares',
  'news',
  'tin',
  'tuc',
  'chung',
  'khoan',
  'hose',
  'hsx',
  'hnx',
  'upcom',
  'ctcp',
  'cp',
  'jsc',
]);

export function resolveNewsCompany(query) {
  const distinctive = (value) =>
    normalize(value)
      .split(' ')
      .filter((word) => !genericWords.has(word))
      .join(' ');
  const name = distinctive(query);
  if (!name) return null;
  const company = companies.find((company) =>
    company.names.some((alias) => distinctive(alias) === name),
  );
  return company ? { ticker: company.names[0], name: company.names[1] } : null;
}

export function matchesNewsQuery(article, query) {
  let texts = [article.title, article.content].map(normalize);
  if (resolveNewsCompany(query)?.ticker === 'FPT')
    texts = texts.map((text) =>
      text.replace(
        /fpt retail|fpt shop|fpt capital|ban le ky thuat so fpt|quan ly quy dau tu fpt/g,
        ' ',
      ),
    );
  const aliases = findCompanies(query).flatMap((company) =>
    company.normalized.filter((alias) => {
      if (company.names[0] !== 'GAS' || alias !== 'gas') return true;
      // GAS is a stock ticker, but ordinary gas-price/stove stories use the same word.
      return (
        [article.title, article.content].some((value) => /\bGAS\s*:/.test(String(value || ''))) ||
        texts.some((text) =>
          /\b(?:co phieu|ma|stock|shares|ticker) gas\b|\bgas (?:hose|hsx|hnx|upcom|stock|shares)\b/.test(
            text,
          ),
        )
      );
    }),
  );
  if (aliases.length)
    return aliases.some((name) => texts.some((text) => containsPhrase(text, name)));

  // Unknown companies still work: match their complete distinctive name, not any one word.
  const name = normalize(query)
    .split(' ')
    .filter((word) => word.length >= 2 && !genericWords.has(word))
    .join(' ');
  return texts.some((text) => containsPhrase(text, name));
}
