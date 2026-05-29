package com.khatiyan.c_shared.exception;

public class NotFoundException extends BusinessException {

    public NotFoundException(String resource, Object id) {
        super("NOT_FOUND", "%s with id %s not found".formatted(resource, id));
    }
}
