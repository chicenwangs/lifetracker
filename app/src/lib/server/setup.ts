// PSEUDO (FR-A6)
// isSetupDone() = app_meta['setup_done'] == '1'
// runSetup({token, username, display_name, password}, ip):
//   if isSetupDone() or !env.SETUP_TOKEN -> 404
//   ratelimit setup:ip 5
//   if !timingSafeEqualStr(token, env.SETUP_TOKEN) -> fail + generic error
//   txImmediate:
//     re-check !setup_done AND count(users)=0 else 404
//     insert user role=admin color '#1C1917' ; insert calendar {name 'My calendar', is_default 1}
//     app_meta setup_done = '1'
//   (no seed import here)
