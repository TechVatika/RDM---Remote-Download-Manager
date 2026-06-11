/// Default backend base URL. Overridable at runtime on the login / settings
/// screen (persisted via shared_preferences under [kBaseUrlKey]).
const String kDefaultBaseUrl = 'http://192.168.31.70:3598';

const String kBaseUrlKey = 'rdm_base_url';
const String kTokenKey = 'rdm_token';

const List<String> kCategories = ['general', 'movies', 'software'];
