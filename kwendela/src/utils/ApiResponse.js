'use strict';

class ApiResponse {
  constructor({ success = true, message = 'OK', data = null, meta = null } = {}) {
    this.success = success;
    this.message = message;
    this.data = data;
    if (meta !== null && meta !== undefined) {
      this.meta = meta;
    }
    this.timestamp = new Date().toISOString();
  }

  static success(res, data = null, message = 'Operação concluída com sucesso.', statusCode = 200, meta = null) {
    return res.status(statusCode).json(
      new ApiResponse({
        success: true,
        message,
        data,
        meta
      })
    );
  }

  static created(res, data = null, message = 'Registo criado com sucesso.', meta = null) {
    return ApiResponse.success(res, data, message, 201, meta);
  }

  static paginated(res, items = [], pagination = {}, message = 'Dados obtidos com sucesso.') {
    return ApiResponse.success(res, items, message, 200, { pagination });
  }

  static noContent(res) {
    return res.status(204).send();
  }
}

module.exports = ApiResponse;