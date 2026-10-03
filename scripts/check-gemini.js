import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { researchCompany, publicError } from '../server/research.js';

try {
  const report = await researchCompany({
    query: process.argv[2] || 'FPT Corporation (HOSE: FPT), Vietnam',
    onProgress: (event) => console.log(event.message),
  });
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/live-report.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        company: report.company.name,
        sources: report.sources.length,
        financialPeriods: report.financials.length,
        language: report.language,
        targets: report.targets.length,
        note: 'Price history and news use their separate provider endpoints.',
        output: 'artifacts/live-report.json',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(publicError(error).message);
  process.exitCode = 1;
}
