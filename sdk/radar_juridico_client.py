"""
Issue #89: SDK Oficial Python do Radar Jurídico B2B (Zero dependências externas — usa urllib padrão).
"""

import json
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional


class RadarJuridicoClient:
    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        bearer_token: Optional[str] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.bearer_token = bearer_token

    def _request(
        self, method: str, path: str, body: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"

        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def obter_processo_360(
        self, numero_processo: str, modo: str = "cache"
    ) -> Dict[str, Any]:
        qs = urllib.parse.urlencode({"numeroProcesso": numero_processo, "modo": modo})
        return self._request("GET", f"/api/processo-360?{qs}")

    def due_diligence(
        self,
        documento: Optional[str] = None,
        nome: Optional[str] = None,
        consultar_djen_ao_vivo: bool = False,
    ) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/api/due-diligence",
            {
                "documento": documento,
                "nome": nome,
                "consultarDjenAoVivo": consultar_djen_ao_vivo,
            },
        )

    def consultar_lote(
        self,
        itens: List[str],
        tipo: str = "PROCESSOS",
        callback_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/api/lote/consultar",
            {"tipo": tipo, "itens": itens, "callbackUrl": callback_url},
        )
