package com.khatiyan.modulith;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

import com.khatiyan.KhatiyanApplication;

class ApplicationModuleStructureTest {

    @Test
    void verifiesApplicationModuleStructure() {
        ApplicationModules.of(KhatiyanApplication.class).verify();
    }
}
