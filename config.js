// Configuração do Google para o Controle de Auditorias (ver passo a passo).
// googleClientId: ID do cliente OAuth (tipo "Aplicativo da Web"); Origens JavaScript autorizadas: https://SEU-USUARIO.github.io
// googleApiKey:   Chave de API (restrinja ao site https://SEU-USUARIO.github.io/* e à "Google Picker API")
// googleAppId:    Número do projeto do Google Cloud (Painel do projeto > "Número do projeto")
// emailPrincipal: Gmail onde fica a base única (só ele cria a base; os demais abrem a que ele compartilhou)
window.CF_CONFIG = {
  googleClientId: '39789553736-6ie251ud164in7rhdk6vapvgk4g6c0fu.apps.googleusercontent.com',
  googleApiKey: 'AIzaSyDzCZ2aCr4hCT671SVzkFyV9uPK7KMU54M',
  googleAppId: '39789553736',
  emailPrincipal: 'daud1.cenciar@gmail.com',
  // Robô Auditor (Análise Preliminar): endereço do App da Web do Apps Script na conta DAUD1
  roboUrl: 'https://script.google.com/macros/s/AKfycbzD7VtSz4QXDjf2rgHaD0CpPMXGCdcbMt53T1DEOap1qfhebAWFg7ZwtJOsR4LuDPEQAw/exec'
};
