const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'aaaa-mm' → 'oct-26' */
export function nombreMes(ym: string): string {
  return `${MESES[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`
}
