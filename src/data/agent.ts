// Canned agent replies. The agent is simulated in this front-end-only build.
export const REPLIES: Record<string, string> = {
  'Estourei hoje, e agora?': 'Tudo bem — um dia não define sua semana. Sua média dos últimos 7 dias segue perto da meta. No jantar, mantenha a proteína do plano e reduza o carboidrato pela metade. Amanhã, siga o plano normal, sem compensar com jejum.',
  'Posso trocar o arroz por batata?': 'Pode. Seu plano permite essa substituição: 4 colheres de arroz (120 g) equivalem a 1 batata inglesa média cozida (cerca de 200 g). Prefira cozida ou assada, sem manteiga.',
  'O que comer no lanche?': 'Seu lanche da tarde tem cerca de 200 kcal. Opções do plano: 1 fruta + 30 g de castanhas, ou iogurte natural com 1 colher de aveia. O iogurte ajuda a fechar a proteína do dia.',
  'Como está minha semana?': 'Aderência de 82% e tendência de −0,4 kg por semana. Ponto forte: café da manhã registrado todos os dias. Para melhorar: o lanche da tarde saiu do plano 3 vezes.'
};

export const CHIPS = Object.keys(REPLIES);

export const FALLBACK_REPLY = 'Boa pergunta. Vou olhar seus registros e o plano. Se envolver mudar meta ou porção, coloco na proposta para o nutrólogo — eu não altero metas sozinho.';

export const PROPOSAL = [
  'Antecipar o lanche da tarde para 16h e incluir 15 g de proteína — reduz a fome que aparece às 17h.',
  'Avaliar troca do pão de queijo da manhã por uma opção do plano com o mesmo horário.'
];
