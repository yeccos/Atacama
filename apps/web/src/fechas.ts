const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'aaaa-mm' → 'oct-26' */
export function nombreMes(ym: string): string {
  return `${MESES[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`
}

/** 'aaaa-mm-dd' → '15-oct' */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}-${MESES[Number(iso.slice(5, 7)) - 1]}`
}
