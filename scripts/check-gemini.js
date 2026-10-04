import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { researchCompany, publicError } from '../server/research.js';

try {
  const report = await researchCompany({
    query: process.argv[2] || 'FPT Corporation (HOSE: FPT), Vietnam',
    onProgress: (event) => console.log(event.message),
  });
  await mkdir('artifacts', { recursive: true });
  const complete = report.analysisStatus.state === 'ready';
  const output = complete
    ? 'artifacts/live-grounded-report.json'
    : 'artifacts/live-grounded-partial.json';
  await writeFile(output, JSON.stringify(report, null, 2));
  if (!complete) process.exitCode = 2;
  console.log(
    JSON.stringify(
      {
        company: report.company.name,
        sources: report.sources.length,
        financialPeriods: report.financials.length,
        language: report.language,
        targets: report.targets.length,
        analysisStatus: report.analysisStatus,
        workflow: report.workflow,
        requestUsage: report.requestUsage,
        historicalPrices: report.priceData?.points?.length || 0,
        growthRows: report.growth.length,
        note: 'Price history and news use their separate provider endpoints.',
        output,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const safe = publicError(error);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/live-research-error.json', JSON.stringify(safe, null, 2));
  console.error(safe.message);
  process.exitCode = 1;
}
