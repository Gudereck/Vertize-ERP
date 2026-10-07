// Sessão do usuário. Não depende do Vue: pode ser reaproveitada em outro framework.
//
// O token de acesso fica só em memória (nunca em localStorage), fora do alcance de
// quem inspecionar o armazenamento do navegador. Ao recarregar a página ele se perde
// e é obtido de novo pelo cookie de renovação, que o JavaScript não consegue ler.

import { renovar, type RespostaDeSessao } from './api/autenticacao'
import { ErroApi, requisitar, type OpcoesDeRequisicao } from './http/clienteHttp'

type OuvinteDePerdaDeSessao = () => void

const NOME_DA_TRAVA = 'erp-renovacao-de-sessao'

let tokenDeAcesso: string | null = null
let renovacaoEmAndamento: Promise<RespostaDeSessao | null> | null = null
const ouvintesDePerdaDeSessao = new Set<OuvinteDePerdaDeSessao>()

export function temTokenDeAcesso(): boolean {
  return tokenDeAcesso !== null
}

export function definirTokenDeAcesso(token: string): void {
  tokenDeAcesso = token
}

export function esquecerTokenDeAcesso(): void {
  tokenDeAcesso = null
}

/** Registra uma função chamada quando a sessão expira e não pode ser renovada. Devolve como cancelar. */
export function aoPerderSessao(ouvinte: OuvinteDePerdaDeSessao): () => void {
  ouvintesDePerdaDeSessao.add(ouvinte)
  return () => ouvintesDePerdaDeSessao.delete(ouvinte)
}

async function executarRenovacao(): Promise<RespostaDeSessao | null> {
  try {
    const resposta = await renovar()
    tokenDeAcesso = resposta.tokenDeAcesso
    return resposta
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 401) {
      tokenDeAcesso = null
      return null
    }
    throw erro
  }
}

/**
 * Troca o cookie de renovação por um novo token de acesso. Devolve null quando não
 * há sessão válida. Cada renovação invalida o cookie anterior, então duas ao mesmo
 * tempo fariam uma delas falhar: as chamadas simultâneas desta aba compartilham a
 * mesma requisição, e a trava do navegador põe em fila as de outras abas.
 */
export function renovarSessao(): Promise<RespostaDeSessao | null> {
  if (!renovacaoEmAndamento) {
    const travas = globalThis.navigator?.locks
    const renovacao = travas
      ? (travas.request(NOME_DA_TRAVA, executarRenovacao) as Promise<RespostaDeSessao | null>)
      : executarRenovacao()
    renovacaoEmAndamento = renovacao.finally(() => {
      renovacaoEmAndamento = null
    })
  }
  return renovacaoEmAndamento
}

/** Faz uma requisição com o token de acesso. Se ele tiver vencido, renova uma vez e repete. */
export async function requisitarAutenticado<T>(caminho: string, opcoes: OpcoesDeRequisicao = {}): Promise<T> {
  try {
    return await requisitar<T>(caminho, { ...opcoes, tokenDeAcesso })
  } catch (erro) {
    if (!(erro instanceof ErroApi) || erro.status !== 401) throw erro
    const sessaoRenovada = await renovarSessao()
    if (!sessaoRenovada) {
      ouvintesDePerdaDeSessao.forEach((ouvinte) => ouvinte())
      throw erro
    }
    return requisitar<T>(caminho, { ...opcoes, tokenDeAcesso })
  }
}
