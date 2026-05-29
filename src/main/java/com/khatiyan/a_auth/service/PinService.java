package com.khatiyan.a_auth.service;

import java.util.Set;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;

@Service
public class PinService {

    private static final Set<String> WeakPINS = Set.of(
        "000000", "111111", "222222", "333333", "444444",
        "555555", "666666", "777777", "888888", "999999",
        "123456", "654321", "012345", "987654"
    );


    private final PasswordEncoder  passwordEncoder;
    public PinService(PasswordEncoder passwordEncoder1){
        this.passwordEncoder = passwordEncoder1;
    }

    public String hashPIN(String pin){
        validate(pin);
        return passwordEncoder.encode(pin);
    }

    public boolean matches(String pin, String hash){
        return hash != null && passwordEncoder.matches(pin, hash);
    }

    public void validate(String pin){
        if(pin == null || !pin.matches("\\d{6}")){
            throw new ValidationException("PIN must be exactly 6 digits");
        }

        if(WeakPINS.contains(pin)){
            throw new ValidationException("Weak PIN. Try again with a stronger PIN");

        }
    }

}
