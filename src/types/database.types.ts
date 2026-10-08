export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      atendimento_eventos: {
        Row: {
          atendimento_id: string
          autor_id: string | null
          criado_em: string
          id: string
          para_id: string | null
          status: Database["public"]["Enums"]["status_atendimento"] | null
          texto: string | null
          tipo: string
        }
        Insert: {
          atendimento_id: string
          autor_id?: string | null
          criado_em?: string
          id?: string
          para_id?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"] | null
          texto?: string | null
          tipo: string
        }
        Update: {
          atendimento_id?: string
          autor_id?: string | null
          criado_em?: string
          id?: string
          para_id?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"] | null
          texto?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_eventos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_eventos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_eventos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_eventos_para_id_fkey"
            columns: ["para_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos: {
        Row: {
          assinatura_nome: string | null
          atualizado_em: string
          contato_id: string
          criado_em: string
          id: string
          nao_lidas: number
          numero: number
          primeira_resposta_em: string | null
          resolvido_em: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_atendimento"]
          ultima_mensagem_direcao:
            | Database["public"]["Enums"]["direcao_mensagem"]
            | null
          ultima_mensagem_em: string | null
          ultima_mensagem_previa: string | null
        }
        Insert: {
          assinatura_nome?: string | null
          atualizado_em?: string
          contato_id: string
          criado_em?: string
          id?: string
          nao_lidas?: number
          numero?: never
          primeira_resposta_em?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"]
          ultima_mensagem_direcao?:
            | Database["public"]["Enums"]["direcao_mensagem"]
            | null
          ultima_mensagem_em?: string | null
          ultima_mensagem_previa?: string | null
        }
        Update: {
          assinatura_nome?: string | null
          atualizado_em?: string
          contato_id?: string
          criado_em?: string
          id?: string
          nao_lidas?: number
          numero?: never
          primeira_resposta_em?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"]
          ultima_mensagem_direcao?:
            | Database["public"]["Enums"]["direcao_mensagem"]
            | null
          ultima_mensagem_em?: string | null
          ultima_mensagem_previa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos_etiquetas: {
        Row: {
          atendimento_id: string
          criado_em: string
          criado_por: string | null
          etiqueta_id: string
        }
        Insert: {
          atendimento_id: string
          criado_em?: string
          criado_por?: string | null
          etiqueta_id: string
        }
        Update: {
          atendimento_id?: string
          criado_em?: string
          criado_por?: string | null
          etiqueta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_etiquetas_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_etiquetas_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_etiquetas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_etiquetas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "etiquetas_atendimento"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades: {
        Row: {
          autor_id: string | null
          cliente_id: string | null
          criado_em: string
          dados: Json
          descricao: string
          id: string
          pedido_id: string | null
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          cliente_id?: string | null
          criado_em?: string
          dados?: Json
          descricao: string
          id?: string
          pedido_id?: string | null
          tipo: string
        }
        Update: {
          autor_id?: string | null
          cliente_id?: string | null
          criado_em?: string
          dados?: Json
          descricao?: string
          id?: string
          pedido_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_atendimentos"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "atividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_envios: {
        Row: {
          campanha_id: string
          entregue_em: string | null
          enviada_em: string | null
          erro: string | null
          erro_codigo: number | null
          id: number
          lida_em: string | null
          nome: string | null
          proxima_tentativa_em: string | null
          reservado_em: string | null
          respondida_em: string | null
          resposta: string | null
          saiu_em: string | null
          status: Database["public"]["Enums"]["status_envio_campanha"]
          tentativas: number
          wa_id: string | null
          wamid: string | null
          whatsapp: string
        }
        Insert: {
          campanha_id: string
          entregue_em?: string | null
          enviada_em?: string | null
          erro?: string | null
          erro_codigo?: number | null
          id?: never
          lida_em?: string | null
          nome?: string | null
          proxima_tentativa_em?: string | null
          reservado_em?: string | null
          respondida_em?: string | null
          resposta?: string | null
          saiu_em?: string | null
          status?: Database["public"]["Enums"]["status_envio_campanha"]
          tentativas?: number
          wa_id?: string | null
          wamid?: string | null
          whatsapp: string
        }
        Update: {
          campanha_id?: string
          entregue_em?: string | null
          enviada_em?: string | null
          erro?: string | null
          erro_codigo?: number | null
          id?: never
          lida_em?: string | null
          nome?: string | null
          proxima_tentativa_em?: string | null
          reservado_em?: string | null
          respondida_em?: string | null
          resposta?: string | null
          saiu_em?: string | null
          status?: Database["public"]["Enums"]["status_envio_campanha"]
          tentativas?: number
          wa_id?: string | null
          wamid?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          agendada_para: string | null
          aguardar_ate: string | null
          atualizado_em: string
          botao_sair: boolean
          botao_texto: string | null
          botao_url: string | null
          concluida_em: string | null
          criado_em: string
          criado_por: string | null
          id: string
          imagem_path: string | null
          iniciada_em: string | null
          lista_id: string | null
          modelo_assinatura: string | null
          modelo_categoria: string | null
          modelo_id: string | null
          modelo_motivo: string | null
          modelo_nome: string | null
          modelo_status: string | null
          nome: string
          nome_padrao: string
          origem: string
          origem_descricao: string | null
          pausada_motivo: string | null
          processando_desde: string | null
          rodape: string | null
          status: Database["public"]["Enums"]["status_campanha"]
          texto: string
          total: number
          ultimo_erro: string | null
        }
        Insert: {
          agendada_para?: string | null
          aguardar_ate?: string | null
          atualizado_em?: string
          botao_sair?: boolean
          botao_texto?: string | null
          botao_url?: string | null
          concluida_em?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          imagem_path?: string | null
          iniciada_em?: string | null
          lista_id?: string | null
          modelo_assinatura?: string | null
          modelo_categoria?: string | null
          modelo_id?: string | null
          modelo_motivo?: string | null
          modelo_nome?: string | null
          modelo_status?: string | null
          nome: string
          nome_padrao?: string
          origem: string
          origem_descricao?: string | null
          pausada_motivo?: string | null
          processando_desde?: string | null
          rodape?: string | null
          status?: Database["public"]["Enums"]["status_campanha"]
          texto: string
          total?: number
          ultimo_erro?: string | null
        }
        Update: {
          agendada_para?: string | null
          aguardar_ate?: string | null
          atualizado_em?: string
          botao_sair?: boolean
          botao_texto?: string | null
          botao_url?: string | null
          concluida_em?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          imagem_path?: string | null
          iniciada_em?: string | null
          lista_id?: string | null
          modelo_assinatura?: string | null
          modelo_categoria?: string | null
          modelo_id?: string | null
          modelo_motivo?: string | null
          modelo_nome?: string | null
          modelo_status?: string | null
          nome?: string
          nome_padrao?: string
          origem?: string
          origem_descricao?: string | null
          pausada_motivo?: string | null
          processando_desde?: string | null
          rodape?: string | null
          status?: Database["public"]["Enums"]["status_campanha"]
          texto?: string
          total?: number
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "leads_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          criado_em: string
          id: string
          natureza: Database["public"]["Enums"]["natureza_financeira"]
          nome: string
        }
        Insert: {
          criado_em?: string
          id?: string
          natureza: Database["public"]["Enums"]["natureza_financeira"]
          nome: string
        }
        Update: {
          criado_em?: string
          id?: string
          natureza?: Database["public"]["Enums"]["natureza_financeira"]
          nome?: string
        }
        Relationships: []
      }
      ceps_frete_vip: {
        Row: {
          cep_fim: string
          cep_inicio: string
          id: number
        }
        Insert: {
          cep_fim: string
          cep_inicio: string
          id?: never
        }
        Update: {
          cep_fim?: string
          cep_inicio?: string
          id?: never
        }
        Relationships: []
      }
      clientes: {
        Row: {
          app_usuario_id: string | null
          atualizado_em: string
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          criado_em: string
          data_nascimento: string | null
          email: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_cliente"]
          referencia: string | null
          shopify_customer_id: string | null
          tags: string[]
          uf: string | null
          vip: boolean
          whatsapp: string | null
        }
        Insert: {
          app_usuario_id?: string | null
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_cliente"]
          referencia?: string | null
          shopify_customer_id?: string | null
          tags?: string[]
          uf?: string | null
          vip?: boolean
          whatsapp?: string | null
        }
        Update: {
          app_usuario_id?: string | null
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_cliente"]
          referencia?: string | null
          shopify_customer_id?: string | null
          tags?: string[]
          uf?: string | null
          vip?: boolean
          whatsapp?: string | null
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          atualizado_em: string
          chave_pix: string | null
          frete_vip_arquivo: string | null
          frete_vip_importado_em: string | null
          frete_vip_valor: number
          id: number
          mensagem_cobranca: string
          mensagem_pre_venda: string
          nome_loja: string
          nome_recebedor_pix: string | null
          whatsapp_assinatura: boolean
          whatsapp_comprovante: string | null
          whatsapp_leads_automatico: boolean
          whatsapp_loja: string | null
          whatsapp_nomes_assinatura: string[]
          whatsapp_pasta_leads_id: string | null
        }
        Insert: {
          atualizado_em?: string
          chave_pix?: string | null
          frete_vip_arquivo?: string | null
          frete_vip_importado_em?: string | null
          frete_vip_valor?: number
          id?: number
          mensagem_cobranca?: string
          mensagem_pre_venda?: string
          nome_loja?: string
          nome_recebedor_pix?: string | null
          whatsapp_assinatura?: boolean
          whatsapp_comprovante?: string | null
          whatsapp_leads_automatico?: boolean
          whatsapp_loja?: string | null
          whatsapp_nomes_assinatura?: string[]
          whatsapp_pasta_leads_id?: string | null
        }
        Update: {
          atualizado_em?: string
          chave_pix?: string | null
          frete_vip_arquivo?: string | null
          frete_vip_importado_em?: string | null
          frete_vip_valor?: number
          id?: number
          mensagem_cobranca?: string
          mensagem_pre_venda?: string
          nome_loja?: string
          nome_recebedor_pix?: string | null
          whatsapp_assinatura?: boolean
          whatsapp_comprovante?: string | null
          whatsapp_leads_automatico?: boolean
          whatsapp_loja?: string | null
          whatsapp_nomes_assinatura?: string[]
          whatsapp_pasta_leads_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_whatsapp_pasta_leads_id_fkey"
            columns: ["whatsapp_pasta_leads_id"]
            isOneToOne: false
            referencedRelation: "leads_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_whatsapp_pasta_leads_id_fkey"
            columns: ["whatsapp_pasta_leads_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_pastas"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_fixas: {
        Row: {
          ativa: boolean
          atualizado_em: string
          categoria: string
          criado_em: string
          descricao: string
          dia_vencimento: number
          fim_em: string | null
          fornecedor_id: string | null
          id: string
          inicio_em: string
          observacoes: string | null
          valor: number
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string
          criado_em?: string
          descricao: string
          dia_vencimento: number
          fim_em?: string | null
          fornecedor_id?: string | null
          id?: string
          inicio_em?: string
          observacoes?: string | null
          valor: number
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string
          criado_em?: string
          descricao?: string
          dia_vencimento?: number
          fim_em?: string | null
          fornecedor_id?: string | null
          id?: string
          inicio_em?: string
          observacoes?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_fixas_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar: {
        Row: {
          atualizado_em: string
          categoria: string
          competencia: string
          conta_fixa_id: string | null
          criado_em: string
          descricao: string
          forma_pagamento: string | null
          fornecedor_id: string | null
          id: string
          observacoes: string | null
          pago_em: string | null
          status: Database["public"]["Enums"]["status_conta"]
          tipo: Database["public"]["Enums"]["tipo_conta"]
          valor: number
          valor_pago: number | null
          vencimento: string
        }
        Insert: {
          atualizado_em?: string
          categoria?: string
          competencia: string
          conta_fixa_id?: string | null
          criado_em?: string
          descricao: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          id?: string
          observacoes?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["status_conta"]
          tipo?: Database["public"]["Enums"]["tipo_conta"]
          valor: number
          valor_pago?: number | null
          vencimento: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          competencia?: string
          conta_fixa_id?: string | null
          criado_em?: string
          descricao?: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          id?: string
          observacoes?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["status_conta"]
          tipo?: Database["public"]["Enums"]["tipo_conta"]
          valor?: number
          valor_pago?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_conta_fixa_id_fkey"
            columns: ["conta_fixa_id"]
            isOneToOne: false
            referencedRelation: "contas_fixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber: {
        Row: {
          atualizado_em: string
          categoria: string
          competencia: string
          criado_em: string
          descricao: string
          forma_pagamento: string | null
          id: string
          observacoes: string | null
          pagador: string | null
          recebido_em: string | null
          status: Database["public"]["Enums"]["status_recebimento"]
          valor: number
          valor_recebido: number | null
          vencimento: string
        }
        Insert: {
          atualizado_em?: string
          categoria?: string
          competencia: string
          criado_em?: string
          descricao: string
          forma_pagamento?: string | null
          id?: string
          observacoes?: string | null
          pagador?: string | null
          recebido_em?: string | null
          status?: Database["public"]["Enums"]["status_recebimento"]
          valor: number
          valor_recebido?: number | null
          vencimento: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          competencia?: string
          criado_em?: string
          descricao?: string
          forma_pagamento?: string | null
          id?: string
          observacoes?: string | null
          pagador?: string | null
          recebido_em?: string | null
          status?: Database["public"]["Enums"]["status_recebimento"]
          valor?: number
          valor_recebido?: number | null
          vencimento?: string
        }
        Relationships: []
      }
      etiquetas_atendimento: {
        Row: {
          cor: string
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetas_atendimento_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_integracao: {
        Row: {
          criado_em: string
          entidade: string | null
          entidade_id: string | null
          id: string
          payload: Json
          processado_em: string | null
          proxima_tentativa_em: string
          status: Database["public"]["Enums"]["status_evento"]
          tentativas: number
          tipo: string
          ultimo_erro: string | null
        }
        Insert: {
          criado_em?: string
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          payload?: Json
          processado_em?: string | null
          proxima_tentativa_em?: string
          status?: Database["public"]["Enums"]["status_evento"]
          tentativas?: number
          tipo: string
          ultimo_erro?: string | null
        }
        Update: {
          criado_em?: string
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          payload?: Json
          processado_em?: string | null
          proxima_tentativa_em?: string
          status?: Database["public"]["Enums"]["status_evento"]
          tentativas?: number
          tipo?: string
          ultimo_erro?: string | null
        }
        Relationships: []
      }
      fornecedor_vendedores: {
        Row: {
          criado_em: string
          fornecedor_id: string
          vendedor_id: string
        }
        Insert: {
          criado_em?: string
          fornecedor_id: string
          vendedor_id: string
        }
        Update: {
          criado_em?: string
          fornecedor_id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedor_vendedores_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedor_vendedores_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cidade: string | null
          cnpj: string | null
          criado_em: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          razao_social: string | null
          site: string | null
          telefone: string | null
          uf: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cidade?: string | null
          cnpj?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          razao_social?: string | null
          site?: string | null
          telefone?: string | null
          uf?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cidade?: string | null
          cnpj?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          razao_social?: string | null
          site?: string | null
          telefone?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      integracao_olist: {
        Row: {
          access_expira_em: string | null
          access_token: string | null
          atualizado_em: string
          conectado_em: string | null
          conectado_por: string | null
          id: number
          refresh_expira_em: string | null
          refresh_token: string | null
          sincronizado_ate: string | null
          sincronizando_desde: string | null
          ultima_sincronizacao: string | null
          ultimo_erro: string | null
        }
        Insert: {
          access_expira_em?: string | null
          access_token?: string | null
          atualizado_em?: string
          conectado_em?: string | null
          conectado_por?: string | null
          id?: number
          refresh_expira_em?: string | null
          refresh_token?: string | null
          sincronizado_ate?: string | null
          sincronizando_desde?: string | null
          ultima_sincronizacao?: string | null
          ultimo_erro?: string | null
        }
        Update: {
          access_expira_em?: string | null
          access_token?: string | null
          atualizado_em?: string
          conectado_em?: string | null
          conectado_por?: string | null
          id?: number
          refresh_expira_em?: string | null
          refresh_token?: string | null
          sincronizado_ate?: string | null
          sincronizando_desde?: string | null
          ultima_sincronizacao?: string | null
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integracao_olist_conectado_por_fkey"
            columns: ["conectado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          busca: string | null
          criado_em: string
          dados: Json
          ddd: string | null
          email: string | null
          id: string
          linha: number
          lista_id: string
          nome: string | null
          whatsapp: string | null
        }
        Insert: {
          busca?: string | null
          criado_em?: string
          dados?: Json
          ddd?: string | null
          email?: string | null
          id?: string
          linha: number
          lista_id: string
          nome?: string | null
          whatsapp?: string | null
        }
        Update: {
          busca?: string | null
          criado_em?: string
          dados?: Json
          ddd?: string | null
          email?: string | null
          id?: string
          linha?: number
          lista_id?: string
          nome?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "leads_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_listas: {
        Row: {
          arquivo_nome: string | null
          atualizado_em: string
          coluna_email: string | null
          coluna_nome: string | null
          coluna_whatsapp: string | null
          colunas: Json
          com_email: number
          com_whatsapp: number
          criado_em: string
          criado_por: string | null
          ddds: Json
          id: string
          nome: string
          origem: string | null
          pasta_id: string
          status: Database["public"]["Enums"]["status_lista_leads"]
          total: number
        }
        Insert: {
          arquivo_nome?: string | null
          atualizado_em?: string
          coluna_email?: string | null
          coluna_nome?: string | null
          coluna_whatsapp?: string | null
          colunas?: Json
          com_email?: number
          com_whatsapp?: number
          criado_em?: string
          criado_por?: string | null
          ddds?: Json
          id?: string
          nome: string
          origem?: string | null
          pasta_id: string
          status?: Database["public"]["Enums"]["status_lista_leads"]
          total?: number
        }
        Update: {
          arquivo_nome?: string | null
          atualizado_em?: string
          coluna_email?: string | null
          coluna_nome?: string | null
          coluna_whatsapp?: string | null
          colunas?: Json
          com_email?: number
          com_whatsapp?: number
          criado_em?: string
          criado_por?: string | null
          ddds?: Json
          id?: string
          nome?: string
          origem?: string | null
          pasta_id?: string
          status?: Database["public"]["Enums"]["status_lista_leads"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_listas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listas_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "leads_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listas_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_pastas"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_pastas: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_pastas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          descricao: string
          id: string
          pedido_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          total: number
        }
        Insert: {
          descricao: string
          id?: string
          pedido_id: string
          preco_unitario: number
          produto_id?: string | null
          quantidade: number
          total?: number
        }
        Update: {
          descricao?: string
          id?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_venda"]
          cliente_id: string
          cobrancas_enviadas: number
          criado_em: string
          criado_por: string | null
          desconto: number
          endereco_entrega: Json | null
          forma_pagamento: string | null
          frete: Database["public"]["Enums"]["situacao_frete"] | null
          id: string
          numero: number
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_pedido"]
          pago_em: string | null
          pre_venda_id: string | null
          shopify_order_id: string | null
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          total: number
          ultima_cobranca_em: string | null
        }
        Insert: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          cliente_id: string
          cobrancas_enviadas?: number
          criado_em?: string
          criado_por?: string | null
          desconto?: number
          endereco_entrega?: Json | null
          forma_pagamento?: string | null
          frete?: Database["public"]["Enums"]["situacao_frete"] | null
          id?: string
          numero?: never
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_pedido"]
          pago_em?: string | null
          pre_venda_id?: string | null
          shopify_order_id?: string | null
          status?: Database["public"]["Enums"]["status_pedido"]
          status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
          subtotal?: number
          taxa_entrega?: number
          total?: number
          ultima_cobranca_em?: string | null
        }
        Update: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          cliente_id?: string
          cobrancas_enviadas?: number
          criado_em?: string
          criado_por?: string | null
          desconto?: number
          endereco_entrega?: Json | null
          forma_pagamento?: string | null
          frete?: Database["public"]["Enums"]["situacao_frete"] | null
          id?: string
          numero?: never
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_pedido"]
          pago_em?: string | null
          pre_venda_id?: string | null
          shopify_order_id?: string | null
          status?: Database["public"]["Enums"]["status_pedido"]
          status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
          subtotal?: number
          taxa_entrega?: number
          total?: number
          ultima_cobranca_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_atendimentos"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "pre_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "vw_pre_vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_erp: {
        Row: {
          canal: string
          data_pedido: string
          ecommerce: string | null
          id: number
          numero: number | null
          sincronizado_em: string
          situacao: number
          valor: number
        }
        Insert: {
          canal: string
          data_pedido: string
          ecommerce?: string | null
          id: number
          numero?: number | null
          sincronizado_em?: string
          situacao?: number
          valor?: number
        }
        Update: {
          canal?: string
          data_pedido?: string
          ecommerce?: string | null
          id?: number
          numero?: number | null
          sincronizado_em?: string
          situacao?: number
          valor?: number
        }
        Relationships: []
      }
      perfis: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cargo: string | null
          criado_em: string
          email: string | null
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          trocar_senha: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          email?: string | null
          id: string
          nome?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          trocar_senha?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          trocar_senha?: boolean
        }
        Relationships: []
      }
      pre_venda_itens: {
        Row: {
          id: string
          limite_por_cliente: number | null
          ordem: number
          pre_venda_id: string
          preco: number
          produto_id: string
          quantidade_disponivel: number | null
        }
        Insert: {
          id?: string
          limite_por_cliente?: number | null
          ordem?: number
          pre_venda_id: string
          preco: number
          produto_id: string
          quantidade_disponivel?: number | null
        }
        Update: {
          id?: string
          limite_por_cliente?: number | null
          ordem?: number
          pre_venda_id?: string
          preco?: number
          produto_id?: string
          quantidade_disponivel?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_venda_itens_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "pre_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_venda_itens_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "vw_pre_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_vendas: {
        Row: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_venda"]
          criado_em: string
          criado_por: string | null
          descricao: string | null
          encerra_em: string | null
          id: string
          previsao_entrega: string | null
          slug: string
          status: Database["public"]["Enums"]["status_pre_venda"]
          taxa_entrega: number
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          encerra_em?: string | null
          id?: string
          previsao_entrega?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["status_pre_venda"]
          taxa_entrega?: number
          titulo: string
        }
        Update: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          encerra_em?: string | null
          id?: string
          previsao_entrega?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["status_pre_venda"]
          taxa_entrega?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_vendas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cervejaria: string | null
          cervejas_do_kit: Json
          criado_em: string
          descricao: string | null
          estilo: string | null
          fornecedor_id: string | null
          fotos: string[]
          id: string
          imagem_url: string | null
          nome: string
          preco: number
          shopify_product_id: string | null
          shopify_variant_id: string | null
          sku: string | null
          teor_alcoolico: number | null
          volume_ml: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cervejaria?: string | null
          cervejas_do_kit?: Json
          criado_em?: string
          descricao?: string | null
          estilo?: string | null
          fornecedor_id?: string | null
          fotos?: string[]
          id?: string
          imagem_url?: string | null
          nome: string
          preco?: number
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          teor_alcoolico?: number | null
          volume_ml?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cervejaria?: string | null
          cervejas_do_kit?: Json
          criado_em?: string
          descricao?: string | null
          estilo?: string | null
          fornecedor_id?: string | null
          fotos?: string[]
          id?: string
          imagem_url?: string | null
          nome?: string
          preco?: number
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          teor_alcoolico?: number | null
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          eventos: string[]
          id: string
          nome: string
          segredo: string
          url: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          eventos?: string[]
          id?: string
          nome: string
          segredo?: string
          url: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          eventos?: string[]
          id?: string
          nome?: string
          segredo?: string
          url?: string
        }
        Relationships: []
      }
      whatsapp_contatos: {
        Row: {
          anotacoes: string | null
          atualizado_em: string
          chatid: string
          criado_em: string
          foto_conferida_em: string | null
          foto_expira_em: string | null
          foto_url: string | null
          id: string
          lead_id: string | null
          nome: string | null
          nome_whatsapp: string | null
          whatsapp: string | null
        }
        Insert: {
          anotacoes?: string | null
          atualizado_em?: string
          chatid: string
          criado_em?: string
          foto_conferida_em?: string | null
          foto_expira_em?: string | null
          foto_url?: string | null
          id?: string
          lead_id?: string | null
          nome?: string | null
          nome_whatsapp?: string | null
          whatsapp?: string | null
        }
        Update: {
          anotacoes?: string | null
          atualizado_em?: string
          chatid?: string
          criado_em?: string
          foto_conferida_em?: string | null
          foto_expira_em?: string | null
          foto_url?: string | null
          id?: string
          lead_id?: string | null
          nome?: string | null
          nome_whatsapp?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_descadastros: {
        Row: {
          campanha_id: string | null
          criado_em: string
          origem: string
          whatsapp: string
        }
        Insert: {
          campanha_id?: string | null
          criado_em?: string
          origem: string
          whatsapp: string
        }
        Update: {
          campanha_id?: string | null
          criado_em?: string
          origem?: string
          whatsapp?: string
        }
        Relationships: []
      }
      whatsapp_mensagens: {
        Row: {
          atendimento_id: string | null
          citada_wa_id: string | null
          contato_id: string
          criado_em: string
          direcao: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_em: string
          enviada_por: string | null
          erro: string | null
          id: string
          midia_mime: string | null
          midia_nome: string | null
          midia_path: string | null
          midia_segundos: number | null
          midia_status: string | null
          status: Database["public"]["Enums"]["status_mensagem_whatsapp"] | null
          texto: string | null
          tipo: string
          wa_id: string | null
          wa_messageid: string | null
        }
        Insert: {
          atendimento_id?: string | null
          citada_wa_id?: string | null
          contato_id: string
          criado_em?: string
          direcao: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_em?: string
          enviada_por?: string | null
          erro?: string | null
          id?: string
          midia_mime?: string | null
          midia_nome?: string | null
          midia_path?: string | null
          midia_segundos?: number | null
          midia_status?: string | null
          status?:
            | Database["public"]["Enums"]["status_mensagem_whatsapp"]
            | null
          texto?: string | null
          tipo?: string
          wa_id?: string | null
          wa_messageid?: string | null
        }
        Update: {
          atendimento_id?: string | null
          citada_wa_id?: string | null
          contato_id?: string
          criado_em?: string
          direcao?: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_em?: string
          enviada_por?: string | null
          erro?: string | null
          id?: string
          midia_mime?: string | null
          midia_nome?: string | null
          midia_path?: string | null
          midia_segundos?: number | null
          midia_status?: string | null
          status?:
            | Database["public"]["Enums"]["status_mensagem_whatsapp"]
            | null
          texto?: string | null
          tipo?: string
          wa_id?: string | null
          wa_messageid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_enviada_por_fkey"
            columns: ["enviada_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_oficial: {
        Row: {
          app_id: string | null
          atualizado_em: string
          conectado_em: string | null
          conectado_por: string | null
          id: number
          limite_tier: string | null
          nome_verificado: string | null
          numero: string | null
          phone_number_id: string | null
          qualidade: string | null
          rotina_desde: string | null
          status_nome: string | null
          token_verificacao: string
          ultimo_erro: string | null
          verificado_em: string | null
          waba_id: string | null
          webhook_recebido_em: string | null
        }
        Insert: {
          app_id?: string | null
          atualizado_em?: string
          conectado_em?: string | null
          conectado_por?: string | null
          id?: number
          limite_tier?: string | null
          nome_verificado?: string | null
          numero?: string | null
          phone_number_id?: string | null
          qualidade?: string | null
          rotina_desde?: string | null
          status_nome?: string | null
          token_verificacao?: string
          ultimo_erro?: string | null
          verificado_em?: string | null
          waba_id?: string | null
          webhook_recebido_em?: string | null
        }
        Update: {
          app_id?: string | null
          atualizado_em?: string
          conectado_em?: string | null
          conectado_por?: string | null
          id?: number
          limite_tier?: string | null
          nome_verificado?: string | null
          numero?: string | null
          phone_number_id?: string | null
          qualidade?: string | null
          rotina_desde?: string | null
          status_nome?: string | null
          token_verificacao?: string
          ultimo_erro?: string | null
          verificado_em?: string | null
          waba_id?: string | null
          webhook_recebido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_oficial_conectado_por_fkey"
            columns: ["conectado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_atendimentos: {
        Row: {
          atualizado_em: string | null
          busca: string | null
          chatid: string | null
          cliente_id: string | null
          cliente_nome: string | null
          contato_foto: string | null
          contato_id: string | null
          contato_nome: string | null
          criado_em: string | null
          etiquetas: Json | null
          id: string | null
          lead_id: string | null
          nao_lidas: number | null
          nome_whatsapp: string | null
          numero: number | null
          primeira_resposta_em: string | null
          resolvido_em: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          status: Database["public"]["Enums"]["status_atendimento"] | null
          ultima_mensagem_direcao:
            | Database["public"]["Enums"]["direcao_mensagem"]
            | null
          ultima_mensagem_em: string | null
          ultima_mensagem_previa: string | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_campanhas: {
        Row: {
          agendada_para: string | null
          aguardar_ate: string | null
          atualizado_em: string | null
          botao_sair: boolean | null
          botao_texto: string | null
          botao_url: string | null
          concluida_em: string | null
          criado_em: string | null
          criado_por: string | null
          entregues: number | null
          enviadas: number | null
          falhas: number | null
          id: string | null
          ignoradas: number | null
          imagem_path: string | null
          iniciada_em: string | null
          lidas: number | null
          lista_id: string | null
          modelo_assinatura: string | null
          modelo_categoria: string | null
          modelo_id: string | null
          modelo_motivo: string | null
          modelo_nome: string | null
          modelo_status: string | null
          nome: string | null
          nome_padrao: string | null
          origem: string | null
          origem_descricao: string | null
          pausada_motivo: string | null
          pendentes: number | null
          processando_desde: string | null
          respostas: number | null
          rodape: string | null
          sairam: number | null
          status: Database["public"]["Enums"]["status_campanha"] | null
          texto: string | null
          total: number | null
          ultimo_erro: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "leads_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_clientes: {
        Row: {
          app_usuario_id: string | null
          atualizado_em: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          criado_em: string | null
          data_nascimento: string | null
          em_aberto: number | null
          email: string | null
          id: string | null
          logradouro: string | null
          nome: string | null
          numero: string | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_cliente"] | null
          pedidos: number | null
          referencia: string | null
          shopify_customer_id: string | null
          tags: string[] | null
          total_gasto: number | null
          uf: string | null
          ultimo_pedido_em: string | null
          vip: boolean | null
          whatsapp: string | null
        }
        Relationships: []
      }
      vw_contas_pagar: {
        Row: {
          atualizado_em: string | null
          categoria: string | null
          competencia: string | null
          conta_fixa_id: string | null
          criado_em: string | null
          descricao: string | null
          forma_pagamento: string | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          id: string | null
          observacoes: string | null
          pago_em: string | null
          situacao: string | null
          status: Database["public"]["Enums"]["status_conta"] | null
          tipo: Database["public"]["Enums"]["tipo_conta"] | null
          valor: number | null
          valor_pago: number | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_conta_fixa_id_fkey"
            columns: ["conta_fixa_id"]
            isOneToOne: false
            referencedRelation: "contas_fixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_contas_receber: {
        Row: {
          atualizado_em: string | null
          categoria: string | null
          competencia: string | null
          criado_em: string | null
          descricao: string | null
          forma_pagamento: string | null
          id: string | null
          observacoes: string | null
          pagador: string | null
          recebido_em: string | null
          situacao: string | null
          status: Database["public"]["Enums"]["status_recebimento"] | null
          valor: number | null
          valor_recebido: number | null
          vencimento: string | null
        }
        Insert: {
          atualizado_em?: string | null
          categoria?: string | null
          competencia?: string | null
          criado_em?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string | null
          observacoes?: string | null
          pagador?: string | null
          recebido_em?: string | null
          situacao?: never
          status?: Database["public"]["Enums"]["status_recebimento"] | null
          valor?: number | null
          valor_recebido?: number | null
          vencimento?: string | null
        }
        Update: {
          atualizado_em?: string | null
          categoria?: string | null
          competencia?: string | null
          criado_em?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string | null
          observacoes?: string | null
          pagador?: string | null
          recebido_em?: string | null
          situacao?: never
          status?: Database["public"]["Enums"]["status_recebimento"] | null
          valor?: number | null
          valor_recebido?: number | null
          vencimento?: string | null
        }
        Relationships: []
      }
      vw_leads: {
        Row: {
          busca: string | null
          criado_em: string | null
          dados: Json | null
          ddd: string | null
          email: string | null
          id: string | null
          ja_cliente: boolean | null
          linha: number | null
          lista_id: string | null
          nome: string | null
          whatsapp: string | null
        }
        Insert: {
          busca?: string | null
          criado_em?: string | null
          dados?: Json | null
          ddd?: string | null
          email?: string | null
          id?: string | null
          ja_cliente?: never
          linha?: number | null
          lista_id?: string | null
          nome?: string | null
          whatsapp?: string | null
        }
        Update: {
          busca?: string | null
          criado_em?: string | null
          dados?: Json | null
          ddd?: string | null
          email?: string | null
          id?: string | null
          ja_cliente?: never
          linha?: number | null
          lista_id?: string | null
          nome?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "leads_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_leads_pastas: {
        Row: {
          atualizado_em: string | null
          com_email: number | null
          com_whatsapp: number | null
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          id: string | null
          leads: number | null
          listas: number | null
          nome: string | null
          ultima_lista_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_pastas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pedidos: {
        Row: {
          atualizado_em: string | null
          canal: Database["public"]["Enums"]["canal_venda"] | null
          cliente_id: string | null
          cliente_nome: string | null
          cliente_whatsapp: string | null
          cobrancas_enviadas: number | null
          criado_em: string | null
          criado_por: string | null
          desconto: number | null
          endereco_entrega: Json | null
          forma_pagamento: string | null
          id: string | null
          numero: number | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_pedido"] | null
          pago_em: string | null
          pre_venda_id: string | null
          pre_venda_titulo: string | null
          shopify_order_id: string | null
          status: Database["public"]["Enums"]["status_pedido"] | null
          status_pagamento:
            | Database["public"]["Enums"]["status_pagamento"]
            | null
          subtotal: number | null
          taxa_entrega: number | null
          total: number | null
          ultima_cobranca_em: string | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_atendimentos"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "pre_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "vw_pre_vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pre_venda_itens: {
        Row: {
          cervejaria: string | null
          cervejas_do_kit: Json | null
          descricao: string | null
          estilo: string | null
          fotos: string[] | null
          id: string | null
          imagem_url: string | null
          limite_por_cliente: number | null
          nome: string | null
          ordem: number | null
          pre_venda_id: string | null
          preco: number | null
          produto_id: string | null
          quantidade_disponivel: number | null
          restante: number | null
          teor_alcoolico: number | null
          vendido: number | null
          volume_ml: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_venda_itens_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "pre_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_venda_itens_pre_venda_id_fkey"
            columns: ["pre_venda_id"]
            isOneToOne: false
            referencedRelation: "vw_pre_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pre_vendas: {
        Row: {
          atualizado_em: string | null
          canal: Database["public"]["Enums"]["canal_venda"] | null
          criado_em: string | null
          criado_por: string | null
          descricao: string | null
          encerra_em: string | null
          id: string | null
          pedidos: number | null
          previsao_entrega: string | null
          slug: string | null
          status: Database["public"]["Enums"]["status_pre_venda"] | null
          status_efetivo: Database["public"]["Enums"]["status_pre_venda"] | null
          taxa_entrega: number | null
          titulo: string | null
          total_recebido: number | null
          total_vendido: number | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_vendas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adicionar_contatos_campanha: {
        Args: { p_campanha_id: string; p_contatos: Json }
        Returns: number
      }
      adicionar_lista_campanha: {
        Args: { p_apos?: string; p_campanha_id: string; p_lista_id: string }
        Returns: Json
      }
      alterar_status_atendimento: {
        Args: {
          p_id: string
          p_status: Database["public"]["Enums"]["status_atendimento"]
        }
        Returns: undefined
      }
      aplicar_conta_fixa_aos_pendentes: {
        Args: { p_conta_fixa_id: string }
        Returns: number
      }
      assumir_atendimento: { Args: { p_id: string }; Returns: undefined }
      atualizar_status_envios_campanha: {
        Args: { p_status: Json }
        Returns: undefined
      }
      atualizar_status_whatsapp: {
        Args: {
          p_messageids: string[]
          p_status: Database["public"]["Enums"]["status_mensagem_whatsapp"]
        }
        Returns: number
      }
      cep_tem_frete_vip: { Args: { p_cep: string }; Returns: boolean }
      concluir_importacao_leads: {
        Args: { p_lista_id: string }
        Returns: undefined
      }
      confirmar_campanha: { Args: { p_campanha_id: string }; Returns: Json }
      contatos_campanha_24h: { Args: never; Returns: number }
      cotar_frete_pedido: {
        Args: { p_pedido_id: string; p_valor: number }
        Returns: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_venda"]
          cliente_id: string
          cobrancas_enviadas: number
          criado_em: string
          criado_por: string | null
          desconto: number
          endereco_entrega: Json | null
          forma_pagamento: string | null
          frete: Database["public"]["Enums"]["situacao_frete"] | null
          id: string
          numero: number
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_pedido"]
          pago_em: string | null
          pre_venda_id: string | null
          shopify_order_id: string | null
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          total: number
          ultima_cobranca_em: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credenciais_whatsapp_oficial: {
        Args: never
        Returns: {
          app_id: string
          app_secret: string
          phone_number_id: string
          token: string
          token_verificacao: string
          waba_id: string
        }[]
      }
      criar_pedido: {
        Args: {
          p_canal?: Database["public"]["Enums"]["canal_venda"]
          p_cliente_id: string
          p_desconto?: number
          p_endereco?: Json
          p_itens: Json
          p_observacoes?: string
          p_origem?: Database["public"]["Enums"]["origem_pedido"]
          p_pre_venda_id?: string
          p_taxa_entrega?: number
        }
        Returns: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_venda"]
          cliente_id: string
          cobrancas_enviadas: number
          criado_em: string
          criado_por: string | null
          desconto: number
          endereco_entrega: Json | null
          forma_pagamento: string | null
          frete: Database["public"]["Enums"]["situacao_frete"] | null
          id: string
          numero: number
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_pedido"]
          pago_em: string | null
          pre_venda_id: string | null
          shopify_order_id: string | null
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          total: number
          ultima_cobranca_em: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ddd_do_whatsapp: { Args: { p_whatsapp: string }; Returns: string }
      ddds_dos_leads: {
        Args: { p_lista_id?: string; p_pasta_id?: string }
        Returns: {
          ddd: string
          numeros: number
        }[]
      }
      definir_empresas_do_vendedor: {
        Args: {
          p_fornecedor_ids?: string[]
          p_novas_empresas?: string[]
          p_vendedor_id: string
        }
        Returns: undefined
      }
      desconectar_olist: { Args: never; Returns: undefined }
      desconectar_whatsapp_oficial: { Args: never; Returns: undefined }
      destravar_rotina_campanhas: { Args: never; Returns: undefined }
      eh_admin: { Args: never; Returns: boolean }
      eh_membro_equipe: { Args: never; Returns: boolean }
      endereco_do_cliente: {
        Args: { p_cliente: Database["public"]["Tables"]["clientes"]["Row"] }
        Returns: Json
      }
      excluir_categoria_financeira: {
        Args: { p_id: string }
        Returns: undefined
      }
      excluir_pedido: { Args: { p_pedido_id: string }; Returns: undefined }
      excluir_pre_venda: {
        Args: { p_com_pedidos?: boolean; p_pre_venda_id: string }
        Returns: number
      }
      exportar_numeros_leads: {
        Args: {
          p_apos?: string
          p_ddd?: string
          p_limite?: number
          p_lista_id?: string
          p_pasta_id?: string
        }
        Returns: Json
      }
      gerar_contas_fixas: { Args: { p_competencia: string }; Returns: number }
      guardar_segredo_whatsapp_oficial: {
        Args: { p_descricao: string; p_nome: string; p_valor: string }
        Returns: undefined
      }
      hoje_brasilia: { Args: never; Returns: string }
      identificar_cliente_pre_venda: {
        Args: { p_whatsapp: string }
        Returns: Json
      }
      importar_leads: {
        Args: { p_leads: Json; p_lista_id: string }
        Returns: number
      }
      importar_pedido_shopify: { Args: { p_pedido: Json }; Returns: string }
      marcar_etiqueta_atendimento: {
        Args: {
          p_atendimento_id: string
          p_etiqueta_id: string
          p_marcar: boolean
        }
        Returns: undefined
      }
      metricas_painel: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      normalizar_whatsapp: { Args: { p_numero: string }; Returns: string }
      ordem_status_whatsapp: {
        Args: {
          p_status: Database["public"]["Enums"]["status_mensagem_whatsapp"]
        }
        Returns: number
      }
      pedido_json: { Args: { p_pedido_id: string }; Returns: Json }
      preparar_envio_whatsapp: {
        Args: { p_atendimento_id: string; p_midia?: Json; p_texto: string }
        Returns: Json
      }
      previa_mensagem_whatsapp: {
        Args: { p_texto: string; p_tipo: string }
        Returns: string
      }
      receita_semanal: {
        Args: { p_semanas?: number }
        Returns: {
          canal: Database["public"]["Enums"]["canal_venda"]
          pedidos: number
          semana: string
          total: number
        }[]
      }
      registrar_cobranca: {
        Args: { p_pedido_id: string }
        Returns: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_venda"]
          cliente_id: string
          cobrancas_enviadas: number
          criado_em: string
          criado_por: string | null
          desconto: number
          endereco_entrega: Json | null
          forma_pagamento: string | null
          frete: Database["public"]["Enums"]["situacao_frete"] | null
          id: string
          numero: number
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_pedido"]
          pago_em: string | null
          pre_venda_id: string | null
          shopify_order_id: string | null
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          total: number
          ultima_cobranca_em: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_evento: {
        Args: {
          p_entidade: string
          p_entidade_id: string
          p_payload: Json
          p_tipo: string
        }
        Returns: string
      }
      registrar_mensagem_whatsapp: { Args: { p: Json }; Returns: Json }
      registrar_pedido_pre_venda: {
        Args: {
          p_atualizar_endereco?: boolean
          p_cliente: Json
          p_itens: Json
          p_observacoes?: string
          p_slug: string
        }
        Returns: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_venda"]
          cliente_id: string
          cobrancas_enviadas: number
          criado_em: string
          criado_por: string | null
          desconto: number
          endereco_entrega: Json | null
          forma_pagamento: string | null
          frete: Database["public"]["Enums"]["situacao_frete"] | null
          id: string
          numero: number
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_pedido"]
          pago_em: string | null
          pre_venda_id: string | null
          shopify_order_id: string | null
          status: Database["public"]["Enums"]["status_pedido"]
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          subtotal: number
          taxa_entrega: number
          total: number
          ultima_cobranca_em: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_resposta_campanha: {
        Args: {
          p_contexto?: string
          p_quando: string
          p_saiu: boolean
          p_texto: string
          p_wa_id: string
        }
        Returns: undefined
      }
      renomear_categoria_financeira: {
        Args: { p_id: string; p_nome: string }
        Returns: undefined
      }
      reservar_envios_campanha: {
        Args: { p_campanha_id: string; p_limite: number }
        Returns: {
          id: number
          nome: string
          tentativas: number
          whatsapp: string
        }[]
      }
      resumo_ceps_frete_vip: { Args: never; Returns: Json }
      resumo_produtos_vendidos: {
        Args: {
          p_canal?: Database["public"]["Enums"]["canal_venda"]
          p_fim?: string
          p_inicio?: string
          p_pre_venda_id?: string
          p_status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
        }
        Returns: {
          descricao: string
          estilo: string
          pedidos: number
          produto_id: string
          quantidade: number
          total: number
        }[]
      }
      salvar_conexao_olist: {
        Args: {
          p_access_expira_em: string
          p_access_token: string
          p_refresh_expira_em: string
          p_refresh_token: string
        }
        Returns: undefined
      }
      salvar_lead_whatsapp: {
        Args: { p_contato_id: string; p_pasta_id?: string }
        Returns: string
      }
      salvar_pre_venda: {
        Args: { p_dados: Json; p_id?: string; p_itens: Json }
        Returns: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_venda"]
          criado_em: string
          criado_por: string | null
          descricao: string | null
          encerra_em: string | null
          id: string
          previsao_entrega: string | null
          slug: string
          status: Database["public"]["Enums"]["status_pre_venda"]
          taxa_entrega: number
          titulo: string
        }
        SetofOptions: {
          from: "*"
          to: "pre_vendas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      salvar_whatsapp_oficial: {
        Args: {
          p_app_id: string
          p_app_secret: string
          p_phone_number_id: string
          p_token: string
          p_waba_id: string
        }
        Returns: undefined
      }
      situacao_erp_conta_venda: {
        Args: { p_situacao: number }
        Returns: boolean
      }
      somente_digitos: { Args: { p_texto: string }; Returns: string }
      status_integracao_olist: { Args: never; Returns: Json }
      status_whatsapp_oficial: { Args: never; Returns: Json }
      substituir_ceps_frete_vip: {
        Args: { p_arquivo?: string; p_faixas: Json }
        Returns: Json
      }
      transferir_atendimento: {
        Args: { p_id: string; p_para: string }
        Returns: undefined
      }
      travar_campanha: { Args: { p_campanha_id: string }; Returns: boolean }
      travar_rotina_campanhas: { Args: never; Returns: boolean }
      vendas_crm_por_dia: {
        Args: {
          p_canal: Database["public"]["Enums"]["canal_venda"]
          p_fim: string
          p_inicio: string
        }
        Returns: {
          dia: string
          pedidos: number
          valor: number
        }[]
      }
      vendas_erp_por_canal: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          canal: string
          pedidos: number
          valor: number
        }[]
      }
      vendas_erp_por_dia: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          canal: string
          dia: string
          pedidos: number
          valor: number
        }[]
      }
      whatsapp_canonico: { Args: { p_numero: string }; Returns: string }
    }
    Enums: {
      canal_venda: "grupo_vip" | "whatsapp" | "loja" | "shopify" | "app"
      direcao_mensagem: "entrada" | "saida"
      natureza_financeira: "pagar" | "receber"
      origem_cliente: "manual" | "pre_venda" | "shopify" | "app" | "importacao"
      origem_pedido: "link" | "manual" | "shopify" | "app" | "api"
      papel_usuario: "admin" | "equipe"
      situacao_frete: "vip" | "a_cotar" | "cotado"
      status_atendimento:
        | "fila"
        | "em_atendimento"
        | "aguardando_cliente"
        | "resolvido"
      status_campanha:
        | "preparando"
        | "aguardando_aprovacao"
        | "agendada"
        | "enviando"
        | "pausada"
        | "concluida"
        | "recusada"
        | "cancelada"
        | "falhou"
      status_conta: "pendente" | "paga" | "cancelada"
      status_envio_campanha:
        | "pendente"
        | "enviando"
        | "enviada"
        | "entregue"
        | "lida"
        | "falhou"
        | "ignorada"
      status_evento: "pendente" | "enviado" | "erro" | "ignorado"
      status_lista_leads: "importando" | "pronta"
      status_mensagem_whatsapp:
        | "enviando"
        | "enviada"
        | "entregue"
        | "lida"
        | "falhou"
      status_pagamento: "pendente" | "cobrado" | "pago" | "estornado"
      status_pedido:
        | "novo"
        | "confirmado"
        | "separado"
        | "entregue"
        | "cancelado"
      status_pre_venda: "rascunho" | "ativa" | "encerrada"
      status_recebimento: "pendente" | "recebida" | "cancelada"
      tipo_conta: "fixa" | "variavel"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      canal_venda: ["grupo_vip", "whatsapp", "loja", "shopify", "app"],
      direcao_mensagem: ["entrada", "saida"],
      natureza_financeira: ["pagar", "receber"],
      origem_cliente: ["manual", "pre_venda", "shopify", "app", "importacao"],
      origem_pedido: ["link", "manual", "shopify", "app", "api"],
      papel_usuario: ["admin", "equipe"],
      situacao_frete: ["vip", "a_cotar", "cotado"],
      status_atendimento: [
        "fila",
        "em_atendimento",
        "aguardando_cliente",
        "resolvido",
      ],
      status_campanha: [
        "preparando",
        "aguardando_aprovacao",
        "agendada",
        "enviando",
        "pausada",
        "concluida",
        "recusada",
        "cancelada",
        "falhou",
      ],
      status_conta: ["pendente", "paga", "cancelada"],
      status_envio_campanha: [
        "pendente",
        "enviando",
        "enviada",
        "entregue",
        "lida",
        "falhou",
        "ignorada",
      ],
      status_evento: ["pendente", "enviado", "erro", "ignorado"],
      status_lista_leads: ["importando", "pronta"],
      status_mensagem_whatsapp: [
        "enviando",
        "enviada",
        "entregue",
        "lida",
        "falhou",
      ],
      status_pagamento: ["pendente", "cobrado", "pago", "estornado"],
      status_pedido: [
        "novo",
        "confirmado",
        "separado",
        "entregue",
        "cancelado",
      ],
      status_pre_venda: ["rascunho", "ativa", "encerrada"],
      status_recebimento: ["pendente", "recebida", "cancelada"],
      tipo_conta: ["fixa", "variavel"],
    },
  },
} as const
