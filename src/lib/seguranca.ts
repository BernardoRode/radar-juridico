import dns from 'dns/promises';
import net from 'net';

/**
 * Verifica se um endereço IPv4/IPv6 pertence a faixas privadas, loopback ou metadata (proteção anti-SSRF).
 */
export function ehIpPrivadoOuReservado(ip: string): boolean {
  const cleanIp = ip.replace(/^::ffff:/i, '').trim().toLowerCase();

  if (net.isIPv4(cleanIp)) {
    const partes = cleanIp.split('.').map(Number);
    const [a, b] = partes;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true; // multicast / reservado
    return false;
  }

  if (net.isIPv6(cleanIp)) {
    if (cleanIp === '::1' || cleanIp === '::') return true;
    if (cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }
    return false;
  }

  return true;
}

const DOMINIOS_TRIBUNAIS_PERMITIDOS = ['.jus.br', '.gov.br'];

/**
 * Issue #72: Valida URLs de tribunais para `/api/inspecionar-link` e `/api/documentos/baixar`,
 * prevenindo SSRF ao permitir apenas domínios oficiais do Judiciário (`*.jus.br` / `*.gov.br`).
 */
export function validarUrlTribunalPermitida(rawUrl: string): {
  valida: boolean;
  url?: URL;
  motivo?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valida: false, motivo: 'URL malformada.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valida: false, motivo: 'Apenas protocolos HTTP/HTTPS são permitidos.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    net.isIP(host) !== 0
  ) {
    return {
      valida: false,
      motivo: 'Endereços locais ou IPs diretos não são permitidos na inspeção de documentos.',
    };
  }

  const extrasPermitidos = (process.env.TRIBUNAL_HOSTS_ALLOWLIST || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const permitido =
    DOMINIOS_TRIBUNAIS_PERMITIDOS.some((sufixo) => host.endsWith(sufixo)) ||
    extrasPermitidos.some((extra) => host === extra || host.endsWith(`.${extra}`));

  if (!permitido) {
    return {
      valida: false,
      motivo: `Domínio "${host}" bloqueado por segurança (SSRF). Apenas domínios oficiais de tribunais (*.jus.br / *.gov.br) são permitidos.`,
    };
  }

  return { valida: true, url: parsed };
}

/**
 * Issue #72: Valida URLs de destino de Webhooks contra SSRF, bloqueando loopback,
 * metadata de nuvem (169.254.169.254) e faixas privadas RFC1918.
 */
export async function validarUrlWebhookSegura(rawUrl: string): Promise<{
  valida: boolean;
  url?: URL;
  motivo?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valida: false, motivo: 'URL de webhook inválida.' };
  }

  const emProducao = process.env.NODE_ENV === 'production';
  if (emProducao && parsed.protocol !== 'https:') {
    return { valida: false, motivo: 'Em produção, webhooks exigem HTTPS.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valida: false, motivo: 'Protocolo inválido para webhook.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return { valida: false, motivo: 'Hosts locais/internos são bloqueados por proteção anti-SSRF.' };
  }

  if (net.isIP(host) !== 0) {
    if (ehIpPrivadoOuReservado(host)) {
      return { valida: false, motivo: 'IP privado ou reservado bloqueado por proteção anti-SSRF.' };
    }
    return { valida: true, url: parsed };
  }

  try {
    const registros = await dns.lookup(host, { all: true });
    if (registros.some((r) => ehIpPrivadoOuReservado(r.address))) {
      return {
        valida: false,
        motivo: 'O domínio do webhook resolve para IP privado/interno (bloqueado por proteção anti-SSRF).',
      };
    }
  } catch {
    // Se DNS falhar em ambiente offline, ainda rejeita hosts óbvios já filtrados acima
    if (emProducao) {
      return { valida: false, motivo: 'Não foi possível resolver o DNS do domínio informado.' };
    }
  }

  return { valida: true, url: parsed };
}
