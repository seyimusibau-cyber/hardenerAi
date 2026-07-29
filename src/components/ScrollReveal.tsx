"use client";

import React, { useEffect, useRef, useState } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  variant?:
    | "slide-up"
    | "slide-down"
    | "slide-left"
    | "slide-right"
    | "zoom-in"
    | "flip-up"
    | "cyber-skew"
    | "3d-zoom";
  delay?: number;
  duration?: number;
  className?: string;
}

export default function ScrollReveal({
  children,
  variant = "flip-up",
  delay = 0,
  duration = 850,
  className = "",
}: ScrollRevealProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Continuous bi-directional toggle (fade/slide IN on scroll down, fade/slide OUT on scroll away)
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -30px 0px",
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current);
    };
  }, []);

  const getInitialTransform = () => {
    switch (variant) {
      case "flip-up":
        return "perspective(1000px) rotateX(12deg) translateY(35px) scale(0.97)";
      case "cyber-skew":
        return "skewX(-4deg) translateX(-30px) translateY(20px) scale(0.98)";
      case "3d-zoom":
        return "perspective(1000px) translateZ(-80px) translateY(25px) scale(0.94)";
      case "slide-up":
        return "translateY(45px) scale(0.98)";
      case "slide-down":
        return "translateY(-45px) scale(0.98)";
      case "slide-left":
        return "translateX(45px)";
      case "slide-right":
        return "translateX(-45px)";
      case "zoom-in":
        return "scale(0.92)";
      default:
        return "perspective(1000px) rotateX(12deg) translateY(35px) scale(0.97)";
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? "perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px) translateX(0px) translateY(0px) scale(1) skewX(0deg)"
          : getInitialTransform(),
        filter: isVisible ? "blur(0px)" : "blur(8px)",
        transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, filter ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  );
}
