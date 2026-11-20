/**
 * Issue #104: Validadores matemáticos (CPF, CNPJ e Número CNJ Módulo 97 - Res. CNJ 65/2008)
 * e normalizador de Polo Canônico para APIs B2B.
 */

export function validarCpf(cpfRaw: string): boolean {
  const cpf = (cpfRaw || '').replace(/[^0-9]/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let dv1 = 11 - (soma % 11);
  if (dv1 >= 10) dv1 = 0;
  if (dv1 !== Number(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  let dv2 = 11 - (soma % 11);
  if (dv2 >= 10) dv2 = 0;
  return dv2 === Number(cpf[10]);
}

export function validarCnpj(cnpjRaw: string): boolean {
  const cnpj = (cnpjRaw || '').replace(/[^0-9]/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(cnpj[i]) * pesos1[i];
  const dv1 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (dv1 !== Number(cnpj[12])) return false;

  soma = 0;
  for (let i = 0; i < 13; i++) soma += Number(cnpj[i]) * pesos2[i];
  const dv2 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return dv2 === Number(cnpj[13]);
}

/**
 * Valida o dígito verificador (DD) do Número Único CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)
 * usando aritmética Módulo 97 conforme Resolução CNJ nº 65/2008.
 */
export function validarNumeroCnjMod97(cnjRaw: string): boolean {
  const limpo = (cnjRaw || '').replace(/[^0-9]/g, '');
  if (limpo.length !== 20) return false;

  const nnnnnnn = limpo.slice(0, 7);
  const dd = limpo.slice(7, 9);
  const aaaajtroooo = limpo.slice(9, 20);
  const numeroParaMod = `${nnnnnnn}${aaaajtroooo}${dd}`;

  let resto = 0;
  for (let i = 0; i < numeroParaMod.length; i++) {
    resto = (resto * 10 + Number(numeroParaMod[i])) % 97;
  }
  return resto === 1;
}

export type PoloCanonico = 'ATIVO' | 'PASSIVO' | 'TERCEIRO' | 'DESCONHECIDO';

export function normalizarPoloCanonico(poloRaw?: string | null): PoloCanonico {
  const p = (poloRaw || '').trim().toUpperCase();
  if (!p) return 'DESCONHECIDO';
  if (p === 'A' || p === 'AT' || p.includes('ATIVO') || p.includes('AUTOR') || p.includes('RECLAMANTE') || p.includes('EXEQUENTE')) {
    return 'ATIVO';
  }
  if (p === 'P' || p === 'PA' || p.includes('PASSIVO') || p.includes('REU') || p.includes('RÉU') || p.includes('RECLAMAD') || p.includes('EXECUTAD')) {
    return 'PASSIVO';
  }
  if (p === 'T' || p === 'TC' || p.includes('TERCEIRO') || p.includes('INTERESSADO')) {
    return 'TERCEIRO';
  }
  return 'DESCONHECIDO';
}
